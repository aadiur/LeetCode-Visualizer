"use strict";
/* ===================== PYTHON LEXER ===================== */

const KEYWORDS = new Set([
  'False','None','True','and','as','assert','async','await','break','class',
  'continue','def','del','elif','else','except','finally','for','from','global',
  'if','import','in','is','lambda','nonlocal','not','or','pass','raise','return',
  'try','while','with','yield'
]);

class Tok {
  constructor(type, value, line, col){
    this.type = type; this.value = value; this.line = line; this.col = col;
  }
}

class LexError extends Error {
  constructor(msg, line){ super(msg); this.line = line; this.name='LexError'; }
}

function tokenize(source){
  // Normalize line endings, expand tabs to spaces (8-width, python-like) for indent calc
  const src = source.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  const lines = src.split('\n');
  const tokens = [];
  const indentStack = [0];
  let parenDepth = 0;
  let lastLineHadContent = false;

  for (let ln = 0; ln < lines.length; ln++){
    let raw = lines[ln];
    let i = 0;
    const lineNo = ln; // 0-indexed

    if (parenDepth === 0){
      // compute indentation
      let indent = 0;
      while (i < raw.length && (raw[i] === ' ' || raw[i] === '\t')){
        indent += (raw[i] === '\t') ? 8 - (indent % 8) : 1;
        i++;
      }
      // blank or comment-only line -> skip (no NEWLINE token, no indent change)
      let rest = raw.slice(i);
      if (rest.trim() === '' || rest.trim().startsWith('#')){
        continue;
      }
      if (indent > indentStack[indentStack.length-1]){
        indentStack.push(indent);
        tokens.push(new Tok('INDENT', indent, lineNo, 0));
      } else {
        while (indent < indentStack[indentStack.length-1]){
          indentStack.pop();
          tokens.push(new Tok('DEDENT', indent, lineNo, 0));
        }
        if (indent !== indentStack[indentStack.length-1]){
          throw new LexError(`Inconsistent indentation on line ${lineNo+1}`, lineNo);
        }
      }
    }

    // tokenize the rest of the line starting at i
    let lineEmitted = false;
    while (i < raw.length){
      const ch = raw[i];
      if (ch === ' ' || ch === '\t'){ i++; continue; }
      if (ch === '#'){ break; } // rest of line is comment
      if (ch === '\\' && i === raw.length-1){ i++; break; } // line continuation
      // string literal
      if (ch === '"' || ch === "'"){
        const quote = ch;
        let triple = raw.slice(i,i+3) === quote.repeat(3);
        let isF = false, isR = false;
        // check prefix already consumed? handled below before entering here
        let start = i;
        let strVal = '';
        if (triple){
          i += 3;
          let closed = false;
          let buf = '';
          // multi-line string support: keep consuming lines
          let curLn = ln;
          let curRaw = raw;
          while (true){
            while (i < curRaw.length){
              if (curRaw.slice(i,i+3) === quote.repeat(3)){ i+=3; closed=true; break; }
              if (curRaw[i] === '\\' && i+1 < curRaw.length){ buf += unescapeChar(curRaw[i+1]); i+=2; continue; }
              buf += curRaw[i]; i++;
            }
            if (closed) break;
            buf += '\n';
            curLn++;
            if (curLn >= lines.length) throw new LexError('Unterminated triple-quoted string', ln);
            curRaw = lines[curLn];
            i = 0;
          }
          if (curLn !== ln){ ln = curLn; raw = curRaw; }
          tokens.push(new Tok('STRING', buf, lineNo, start));
          lineEmitted = true;
          continue;
        } else {
          i++;
          let buf = '';
          while (i < raw.length && raw[i] !== quote){
            if (raw[i] === '\\' && i+1 < raw.length){ buf += unescapeChar(raw[i+1]); i += 2; continue; }
            buf += raw[i]; i++;
          }
          if (i >= raw.length) throw new LexError(`Unterminated string on line ${lineNo+1}`, lineNo);
          i++; // consume closing quote
          tokens.push(new Tok('STRING', buf, lineNo, start));
          lineEmitted = true;
          continue;
        }
      }
      // f-string / raw string prefix
      if (/[fFrRbB]/.test(ch) && i+1 < raw.length && (raw[i+1] === '"' || raw[i+1] === "'")){
        const prefix = ch.toLowerCase();
        const quote = raw[i+1];
        let triple = raw.slice(i+1,i+4) === quote.repeat(3);
        let j = triple ? i+4 : i+2;
        let buf = '';
        if (triple){
          while (raw.slice(j,j+3) !== quote.repeat(3)){
            if (j >= raw.length) throw new LexError('Unterminated triple string', lineNo);
            buf += raw[j]; j++;
          }
          j += 3;
        } else {
          while (j < raw.length && raw[j] !== quote){
            if (raw[j] === '\\' && j+1 < raw.length){ buf += raw[j] + raw[j+1]; j+=2; continue; }
            buf += raw[j]; j++;
          }
          j++; // closing quote
        }
        if (prefix === 'f'){
          tokens.push(new Tok('FSTRING', buf, lineNo, i));
        } else {
          // raw / bytes: unescape unless raw
          const val = prefix === 'r' ? buf : buf.replace(/\\(.)/g, (m,c)=>unescapeChar(c));
          tokens.push(new Tok('STRING', val, lineNo, i));
        }
        i = j;
        lineEmitted = true;
        continue;
      }
      // number
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(raw[i+1]||''))){
        let start = i;
        let isFloat = false;
        while (i < raw.length && /[0-9_]/.test(raw[i])) i++;
        if (raw[i] === '.'){ isFloat = true; i++; while (i<raw.length && /[0-9_]/.test(raw[i])) i++; }
        if (raw[i] === 'e' || raw[i] === 'E'){
          isFloat = true; i++;
          if (raw[i]==='+'||raw[i]==='-') i++;
          while (i<raw.length && /[0-9_]/.test(raw[i])) i++;
        }
        // hex/oct/bin
        let text = raw.slice(start,i).replace(/_/g,'');
        let num;
        if (/^0[xX]/.test(text)) num = parseInt(text,16);
        else if (/^0[oO]/.test(text)) num = parseInt(text.slice(2),8);
        else if (/^0[bB]/.test(text)) num = parseInt(text.slice(2),2);
        else num = isFloat ? parseFloat(text) : parseInt(text,10);
        tokens.push(new Tok('NUMBER', num, lineNo, start));
        lineEmitted = true;
        continue;
      }
      // identifier / keyword
      if (/[A-Za-z_]/.test(ch)){
        let start = i;
        while (i < raw.length && /[A-Za-z0-9_]/.test(raw[i])) i++;
        const word = raw.slice(start,i);
        if (KEYWORDS.has(word)) tokens.push(new Tok('KEYWORD', word, lineNo, start));
        else tokens.push(new Tok('NAME', word, lineNo, start));
        lineEmitted = true;
        continue;
      }
      // operators / punctuation (longest match first)
      const three = raw.slice(i,i+3);
      const two = raw.slice(i,i+2);
      const OPS3 = ['**=','//=','>>=','<<=','...'];
      const OPS2 = ['**','//','==','!=','<=','>=','->','+=','-=','*=','/=','%=','&=','|=','^=',':=' ];
      if (OPS3.includes(three)){ tokens.push(new Tok('OP', three, lineNo, i)); i+=3; lineEmitted=true; continue; }
      if (OPS2.includes(two)){ tokens.push(new Tok('OP', two, lineNo, i)); i+=2; lineEmitted=true; continue; }
      if ('()[]{}'.includes(ch)){
        if ('([{'.includes(ch)) parenDepth++;
        else parenDepth = Math.max(0,parenDepth-1);
        tokens.push(new Tok('OP', ch, lineNo, i)); i++; lineEmitted=true; continue;
      }
      if (',:.;=+-*/%<>!&|^~@'.includes(ch)){
        tokens.push(new Tok('OP', ch, lineNo, i)); i++; lineEmitted=true; continue;
      }
      // unknown char - skip it
      i++;
    }
    if (lineEmitted && parenDepth === 0){
      tokens.push(new Tok('NEWLINE', null, lineNo, raw.length));
    }
  }
  // final dedents
  while (indentStack.length > 1){
    indentStack.pop();
    tokens.push(new Tok('DEDENT', 0, lines.length, 0));
  }
  tokens.push(new Tok('ENDMARKER', null, lines.length, 0));
  return tokens;
}

function unescapeChar(c){
  switch(c){
    case 'n': return '\n';
    case 't': return '\t';
    case 'r': return '\r';
    case '\\': return '\\';
    case "'": return "'";
    case '"': return '"';
    case '0': return '\0';
    default: return c;
  }
}

const exportObjLexer = { tokenize, Tok, LexError, KEYWORDS };
if (typeof module !== 'undefined') module.exports = exportObjLexer;
else window.PyLexer = exportObjLexer;
