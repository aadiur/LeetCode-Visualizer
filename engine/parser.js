"use strict";
/* ===================== PYTHON PARSER ===================== */
const { tokenize } = typeof require !== 'undefined' ? require('./lexer.js') : window.PyLexer;

class ParseError extends Error {
  constructor(msg, line){ super(msg); this.line = line; this.name = 'ParseError'; }
}

// AST node helper
function N(type, props, line){ return Object.assign({ type, line }, props); }

class Parser {
  constructor(tokens){
    this.toks = tokens.filter(t => t.type !== 'COMMENT');
    this.pos = 0;
  }
  peek(o=0){ return this.toks[this.pos+o]; }
  cur(){ return this.toks[this.pos]; }
  at(type, value){
    const t = this.cur();
    if (t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }
  atKw(...kws){ const t = this.cur(); return t.type === 'KEYWORD' && kws.includes(t.value); }
  atOp(...ops){ const t = this.cur(); return t.type === 'OP' && ops.includes(t.value); }
  advance(){ return this.toks[this.pos++]; }
  expect(type, value){
    const t = this.cur();
    if (t.type !== type || (value !== undefined && t.value !== value)){
      throw new ParseError(`Expected ${type}${value?(' '+value):''} but got ${t.type} '${t.value}' on line ${t.line+1}`, t.line);
    }
    return this.advance();
  }
  skipNewlines(){ while (this.at('NEWLINE')) this.advance(); }

  parseModule(){
    const body = [];
    this.skipNewlines();
    while (!this.at('ENDMARKER')){
      body.push(this.parseStatement());
      this.skipNewlines();
    }
    return N('Module', { body }, 0);
  }

  parseBlock(){
    this.skipNewlines();
    this.expect('INDENT');
    const body = [];
    this.skipNewlines();
    while (!this.at('DEDENT') && !this.at('ENDMARKER')){
      body.push(this.parseStatement());
      this.skipNewlines();
    }
    if (this.at('DEDENT')) this.advance();
    return body;
  }

  parseSimpleOrBlock(){
    if (this.at('NEWLINE')) return this.parseBlock();
    const body = [];
    body.push(this.parseSmallStatement());
    while (this.atOp(';')){ this.advance(); if(this.at('NEWLINE')) break; body.push(this.parseSmallStatement()); }
    if (this.at('NEWLINE')) this.advance();
    return body;
  }

  parseStatement(){
    const t = this.cur();
    if (t.type === 'KEYWORD'){
      switch(t.value){
        case 'if': return this.parseIf();
        case 'while': return this.parseWhile();
        case 'for': return this.parseFor();
        case 'def': return this.parseDef();
        case 'class': return this.parseClass();
        case 'try': return this.parseTry();
        case 'with': return this.parseWith();
        case 'import': case 'from': return this.parseImport();
      }
    }
    const line = t.line;
    const stmts = [];
    stmts.push(this.parseSmallStatement());
    while (this.atOp(';')){
      this.advance();
      if (this.at('NEWLINE') || this.at('ENDMARKER')) break;
      stmts.push(this.parseSmallStatement());
    }
    if (this.at('NEWLINE')) this.advance();
    if (stmts.length === 1) return stmts[0];
    return N('Block', { body: stmts }, line);
  }

  parseSmallStatement(){
    const t = this.cur();
    if (t.type === 'KEYWORD'){
      switch(t.value){
        case 'return': return this.parseReturn();
        case 'pass': this.advance(); return N('Pass', {}, t.line);
        case 'break': this.advance(); return N('Break', {}, t.line);
        case 'continue': this.advance(); return N('Continue', {}, t.line);
        case 'global': return this.parseGlobal();
        case 'nonlocal': return this.parseNonlocal();
        case 'del': return this.parseDel();
        case 'raise': return this.parseRaise();
        case 'assert': return this.parseAssert();
        case 'import': case 'from': return this.parseImport();
        case 'yield': { this.advance(); let val=null; if(!this.at('NEWLINE') && !this.atOp(';')) val=this.parseExprList(); return N('ExprStmt',{expr:N('Yield',{value:val},t.line)},t.line); }
      }
    }
    return this.parseExprOrAssign();
  }

  parseGlobal(){
    const line = this.cur().line; this.advance();
    const names = [this.expect('NAME').value];
    while (this.atOp(',')){ this.advance(); names.push(this.expect('NAME').value); }
    return N('Global', { names }, line);
  }
  parseNonlocal(){
    const line = this.cur().line; this.advance();
    const names = [this.expect('NAME').value];
    while (this.atOp(',')){ this.advance(); names.push(this.expect('NAME').value); }
    return N('Nonlocal', { names }, line);
  }
  parseDel(){
    const line = this.cur().line; this.advance();
    const target = this.parseExpr ? this.parseExpr() : this.parseExprList();
    return N('Del', { target }, line);
  }
  parseRaise(){
    const line = this.cur().line; this.advance();
    let exc = null;
    if (!this.at('NEWLINE') && !this.atOp(';')) exc = this.parseNamedExpr();
    return N('Raise', { exc }, line);
  }
  parseAssert(){
    const line = this.cur().line; this.advance();
    const test = this.parseNamedExpr();
    let msg = null;
    if (this.atOp(',')){ this.advance(); msg = this.parseNamedExpr(); }
    return N('Assert', { test, msg }, line);
  }
  parseImport(){
    const line = this.cur().line;
    while (!this.at('NEWLINE') && !this.at('ENDMARKER')) this.advance();
    return N('Pass', {}, line);
  }

  parseReturn(){
    const line = this.cur().line; this.advance();
    let val = null;
    if (!this.at('NEWLINE') && !this.at('ENDMARKER') && !this.atOp(';')){
      val = this.parseExprList();
    }
    return N('Return', { value: val }, line);
  }

  parseIf(){
    const line = this.cur().line;
    this.advance();
    const test = this.parseNamedExpr();
    this.expect('OP', ':');
    const body = this.parseSimpleOrBlock();
    let orelse = [];
    if (this.atKw('elif')){
      orelse = [this.parseElif()];
    } else if (this.atKw('else')){
      this.advance();
      this.expect('OP', ':');
      orelse = this.parseSimpleOrBlock();
    }
    return N('If', { test, body, orelse }, line);
  }
  parseElif(){
    const line = this.cur().line;
    this.advance();
    const test = this.parseNamedExpr();
    this.expect('OP', ':');
    const body = this.parseSimpleOrBlock();
    let orelse = [];
    if (this.atKw('elif')){
      orelse = [this.parseElif()];
    } else if (this.atKw('else')){
      this.advance();
      this.expect('OP', ':');
      orelse = this.parseSimpleOrBlock();
    }
    return N('If', { test, body, orelse }, line);
  }

  parseWhile(){
    const line = this.cur().line;
    this.advance();
    const test = this.parseNamedExpr();
    this.expect('OP', ':');
    const body = this.parseSimpleOrBlock();
    let orelse = [];
    if (this.atKw('else')){
      this.advance(); this.expect('OP', ':');
      orelse = this.parseSimpleOrBlock();
    }
    return N('While', { test, body, orelse }, line);
  }

  parseFor(){
    const line = this.cur().line;
    this.advance();
    const target = this.parseTargetList();
    this.expect('KEYWORD', 'in');
    const iter = this.parseExprList();
    this.expect('OP', ':');
    const body = this.parseSimpleOrBlock();
    let orelse = [];
    if (this.atKw('else')){
      this.advance(); this.expect('OP', ':');
      orelse = this.parseSimpleOrBlock();
    }
    return N('For', { target, iter, body, orelse }, line);
  }

  parseTargetList(){
    const first = this.parseTarget();
    if (this.atOp(',')){
      const items = [first];
      while (this.atOp(',')){
        this.advance();
        if (this.atKw('in') || this.atOp(':') ) break;
        items.push(this.parseTarget());
      }
      return N('TupleTarget', { items }, first.line);
    }
    return first;
  }
  parseTarget(){
    if (this.atOp('(') || this.atOp('[')){
      const closeCh = this.atOp('(') ? ')' : ']';
      this.advance();
      const items = [];
      while (!this.atOp(closeCh)){
        items.push(this.parseTarget());
        if (this.atOp(',')) this.advance(); else break;
      }
      this.expect('OP', closeCh);
      return N('TupleTarget', { items }, this.cur().line);
    }
    return this.parsePostfix(this.parseAtom());
  }

  captureAnnotationText(){
    // consume the annotation expression but also return a rough source string for synthesis hints
    let depth = 0; let parts = [];
    while (true){
      const t = this.cur();
      if (depth===0 && (this.atOp('=',',') || this.atOp(')') )) break;
      if (t.type==='NEWLINE' || t.type==='ENDMARKER') break;
      if (t.type==='OP' && '([{'.includes(t.value)) depth++;
      if (t.type==='OP' && ')]}'.includes(t.value)){ if (depth===0) break; depth--; }
      parts.push(String(t.value));
      this.advance();
    }
    return parts.join('');
  }

  parseDef(){
    const line = this.cur().line;
    this.advance();
    const name = this.expect('NAME').value;
    this.expect('OP', '(');
    const params = [];
    while (!this.atOp(')')){
      let star = '';
      if (this.atOp('*')){ this.advance(); star='*'; }
      if (this.atOp('**')){ this.advance(); star='**'; }
      const pname = this.expect('NAME').value;
      let def = null, annotation = null;
      if (this.atOp(':')){ this.advance(); annotation = this.captureAnnotationText(); }
      if (this.atOp('=')){ this.advance(); def = this.parseOr(); }
      params.push({ name: pname, default: def, star, annotation });
      if (this.atOp(',')) this.advance(); else break;
    }
    this.expect('OP', ')');
    if (this.atOp('->')){ this.advance(); this.parseOr(); }
    this.expect('OP', ':');
    const body = this.parseSimpleOrBlock();
    return N('FunctionDef', { name, params, body }, line);
  }

  parseClass(){
    const line = this.cur().line;
    this.advance();
    const name = this.expect('NAME').value;
    let bases = [];
    if (this.atOp('(')){
      this.advance();
      while (!this.atOp(')')){
        bases.push(this.parseOr());
        if (this.atOp(',')) this.advance(); else break;
      }
      this.expect('OP', ')');
    }
    this.expect('OP', ':');
    const body = this.parseSimpleOrBlock();
    return N('ClassDef', { name, bases, body }, line);
  }

  parseTry(){
    const line = this.cur().line;
    this.advance();
    this.expect('OP', ':');
    const body = this.parseSimpleOrBlock();
    const handlers = [];
    while (this.atKw('except')){
      const hline = this.cur().line;
      this.advance();
      let exType = null, exName = null;
      if (!this.atOp(':')){
        exType = this.parseOr();
        if (this.atKw('as')){ this.advance(); exName = this.expect('NAME').value; }
      }
      this.expect('OP', ':');
      const hbody = this.parseSimpleOrBlock();
      handlers.push({ exType, exName, body: hbody, line: hline });
    }
    let orelse = [];
    if (this.atKw('else')){ this.advance(); this.expect('OP',':'); orelse = this.parseSimpleOrBlock(); }
    let finalbody = [];
    if (this.atKw('finally')){ this.advance(); this.expect('OP',':'); finalbody = this.parseSimpleOrBlock(); }
    return N('Try', { body, handlers, orelse, finalbody }, line);
  }

  parseWith(){
    const line = this.cur().line;
    this.advance();
    const items = [];
    items.push(this.parseWithItem());
    while (this.atOp(',')){ this.advance(); items.push(this.parseWithItem()); }
    this.expect('OP', ':');
    const body = this.parseSimpleOrBlock();
    return N('With', { items, body }, line);
  }
  parseWithItem(){
    const ctx = this.parseOr();
    let asName = null;
    if (this.atKw('as')){ this.advance(); asName = this.parseTarget(); }
    return { ctx, asName };
  }

  // ---- expressions ----
  parseExprList(){
    const first = this.parseNamedExprOrStar();
    if (this.atOp(',')){
      const items = [first];
      while (this.atOp(',')){
        this.advance();
        if (this.at('NEWLINE') || this.atOp(':',';') || this.at('ENDMARKER')) break;
        items.push(this.parseNamedExprOrStar());
      }
      return N('Tuple', { items }, first.line);
    }
    return first;
  }

  parseExprOrAssign(){
    const first = this.parseExprList();
    const AUG = ['+=','-=','*=','/=','//=','%=','**=','&=','|=','^=','>>=','<<='];
    if (this.cur().type === 'OP' && AUG.includes(this.cur().value)){
      const op = this.advance().value;
      const val = this.parseExprList();
      return N('AugAssign', { target: first, op: op.slice(0,-1), value: val }, first.line);
    }
    if (this.atOp('=')){
      const targets = [first];
      let value = null;
      while (this.atOp('=')){
        this.advance();
        value = this.parseExprList();
        if (this.atOp('=')) { targets.push(value); }
      }
      return N('Assign', { targets, value }, first.line);
    }
    return N('ExprStmt', { expr: first }, first.line);
  }

  parseNamedExpr(){
    let e = this.parseTernary();
    if (this.atOp(':=')){
      this.advance();
      const val = this.parseTernary();
      return N('NamedExpr', { target: e, value: val }, e.line);
    }
    return e;
  }

  parseTernary(){
    const line = this.cur().line;
    let e = this.parseLambda();
    if (this.atKw('if')){
      this.advance();
      const test = this.parseLambda();
      this.expect('KEYWORD', 'else');
      const orelse = this.parseTernary();
      return N('IfExp', { test, body: e, orelse }, line);
    }
    return e;
  }

  parseLambda(){
    if (this.atKw('lambda')){
      const line = this.cur().line;
      this.advance();
      const params = [];
      while (!this.atOp(':')){
        const pname = this.expect('NAME').value;
        let def = null;
        if (this.atOp('=')){ this.advance(); def = this.parseOr(); }
        params.push({ name: pname, default: def, star:'' });
        if (this.atOp(',')) this.advance(); else break;
      }
      this.expect('OP', ':');
      const body = this.parseTernary();
      return N('Lambda', { params, body }, line);
    }
    return this.parseOr();
  }

  parseOr(){
    let left = this.parseAnd();
    while (this.atKw('or')){
      const line = this.cur().line; this.advance();
      const right = this.parseAnd();
      left = N('BoolOp', { op: 'or', left, right }, line);
    }
    return left;
  }
  parseAnd(){
    let left = this.parseNot();
    while (this.atKw('and')){
      const line = this.cur().line; this.advance();
      const right = this.parseNot();
      left = N('BoolOp', { op: 'and', left, right }, line);
    }
    return left;
  }
  parseNot(){
    if (this.atKw('not')){
      const line = this.cur().line; this.advance();
      return N('UnaryOp', { op: 'not', operand: this.parseNot() }, line);
    }
    return this.parseComparison();
  }
  parseComparison(){
    let left = this.parseBitOr();
    const ops = [];
    const CMP = ['<','>','==','!=','<=','>='];
    while (true){
      if (this.cur().type === 'OP' && CMP.includes(this.cur().value)){
        const op = this.advance().value;
        const right = this.parseBitOr();
        ops.push({ op, right });
      } else if (this.atKw('in')){
        this.advance();
        const right = this.parseBitOr();
        ops.push({ op: 'in', right });
      } else if (this.atKw('not') && this.peek(1).type==='KEYWORD' && this.peek(1).value==='in'){
        this.advance(); this.advance();
        const right = this.parseBitOr();
        ops.push({ op: 'not in', right });
      } else if (this.atKw('is')){
        this.advance();
        let op = 'is';
        if (this.atKw('not')){ this.advance(); op = 'is not'; }
        const right = this.parseBitOr();
        ops.push({ op, right });
      } else break;
    }
    if (ops.length === 0) return left;
    return N('Compare', { left, ops }, left.line);
  }
  parseBitOr(){
    let left = this.parseBitXor();
    while (this.atOp('|')){ this.advance(); left = N('BinOp',{op:'|',left,right:this.parseBitXor()},left.line); }
    return left;
  }
  parseBitXor(){
    let left = this.parseBitAnd();
    while (this.atOp('^')){ this.advance(); left = N('BinOp',{op:'^',left,right:this.parseBitAnd()},left.line); }
    return left;
  }
  parseBitAnd(){
    let left = this.parseShift();
    while (this.atOp('&')){ this.advance(); left = N('BinOp',{op:'&',left,right:this.parseShift()},left.line); }
    return left;
  }
  parseShift(){
    let left = this.parseArith();
    while (this.atOp('<<','>>')){ const op=this.advance().value; left = N('BinOp',{op,left,right:this.parseArith()},left.line); }
    return left;
  }
  parseArith(){
    let left = this.parseTerm();
    while (this.atOp('+','-')){ const op=this.advance().value; left = N('BinOp',{op,left,right:this.parseTerm()},left.line); }
    return left;
  }
  parseTerm(){
    let left = this.parseFactor();
    while (this.atOp('*','/','//','%','@')){ const op=this.advance().value; left = N('BinOp',{op,left,right:this.parseFactor()},left.line); }
    return left;
  }
  parseFactor(){
    if (this.atOp('-','+','~')){
      const op = this.advance().value;
      return N('UnaryOp', { op, operand: this.parseFactor() }, this.cur().line);
    }
    return this.parsePower();
  }
  parsePower(){
    const base = this.parsePostfix(this.parseAtom());
    if (this.atOp('**')){
      this.advance();
      const exp = this.parseFactor();
      return N('BinOp', { op:'**', left: base, right: exp }, base.line);
    }
    return base;
  }

  parsePostfix(atom){
    let e = atom;
    while (true){
      if (this.atOp('.')){
        this.advance();
        const name = this.expect('NAME').value;
        e = N('Attribute', { obj: e, attr: name }, e.line);
      } else if (this.atOp('(')){
        this.advance();
        const args = []; const kwargs = [];
        while (!this.atOp(')')){
          if (this.at('NAME') && this.peek(1).type==='OP' && this.peek(1).value==='=' ){
            const kname = this.advance().value; this.advance();
            kwargs.push({ name: kname, value: this.parseNamedExpr() });
          } else if (this.atOp('*')){
            this.advance();
            args.push(N('Starred', { value: this.parseNamedExpr() }, e.line));
          } else {
            const a = this.parseNamedExpr();
            if (this.atKw('for') && args.length===0 && kwargs.length===0){
              const gens = this.parseCompFor();
              args.push(N('GeneratorExp', { element: a, generators: gens }, a.line));
              break;
            }
            args.push(a);
          }
          if (this.atOp(',')) this.advance(); else break;
        }
        this.expect('OP', ')');
        e = N('Call', { func: e, args, kwargs }, e.line);
      } else if (this.atOp('[')){
        this.advance();
        e = N('Subscript', { obj: e, index: this.parseSubscript() }, e.line);
        this.expect('OP', ']');
      } else break;
    }
    return e;
  }

  parseSubscript(){
    const parseSliceItem = () => {
      let lower = null, upper = null, step = null, isSlice = false;
      if (!this.atOp(':',']')) lower = this.parseNamedExpr();
      if (this.atOp(':')){
        isSlice = true;
        this.advance();
        if (!this.atOp(':',']',',')) upper = this.parseNamedExpr();
        if (this.atOp(':')){
          this.advance();
          if (!this.atOp(']',',')) step = this.parseNamedExpr();
        }
      }
      if (isSlice) return N('Slice', { lower, upper, step }, this.cur().line);
      return lower;
    };
    const first = parseSliceItem();
    if (this.atOp(',')){
      const items = [first];
      while (this.atOp(',')){
        this.advance();
        if (this.atOp(']')) break;
        items.push(parseSliceItem());
      }
      return N('TupleIndex', { items }, first ? first.line : this.cur().line);
    }
    return first;
  }

  parseAtom(){
    const t = this.cur();
    if (t.type === 'NUMBER'){ this.advance(); return N('Num', { value: t.value }, t.line); }
    if (t.type === 'STRING'){
      let val = t.value; this.advance();
      while (this.at('STRING')){ val += this.cur().value; this.advance(); }
      return N('Str', { value: val }, t.line);
    }
    if (t.type === 'FSTRING'){ this.advance(); return this.parseFString(t.value, t.line); }
    if (t.type === 'NAME'){ this.advance(); return N('Name', { id: t.value }, t.line); }
    if (t.type === 'KEYWORD'){
      if (t.value === 'True'){ this.advance(); return N('Const', { value: true }, t.line); }
      if (t.value === 'False'){ this.advance(); return N('Const', { value: false }, t.line); }
      if (t.value === 'None'){ this.advance(); return N('Const', { value: null }, t.line); }
      if (t.value === 'lambda') return this.parseLambda();
      if (t.value === 'not') return this.parseNot();
    }
    if (this.atOp('(')){
      this.advance();
      if (this.atOp(')')){ this.advance(); return N('Tuple', { items: [] }, t.line); }
      const first = this.parseNamedExprOrStar();
      if (this.atKw('for')){
        const comp = this.parseCompFor();
        this.expect('OP', ')');
        return N('GeneratorExp', { element: first, generators: comp }, t.line);
      }
      if (this.atOp(',')){
        const items = [first];
        while (this.atOp(',')){
          this.advance();
          if (this.atOp(')')) break;
          items.push(this.parseNamedExprOrStar());
        }
        this.expect('OP', ')');
        return N('Tuple', { items }, t.line);
      }
      this.expect('OP', ')');
      return first;
    }
    if (this.atOp('[')){
      this.advance();
      if (this.atOp(']')){ this.advance(); return N('List', { items: [] }, t.line); }
      const first = this.parseNamedExprOrStar();
      if (this.atKw('for')){
        const comp = this.parseCompFor();
        this.expect('OP', ']');
        return N('ListComp', { element: first, generators: comp }, t.line);
      }
      const items = [first];
      while (this.atOp(',')){
        this.advance();
        if (this.atOp(']')) break;
        items.push(this.parseNamedExprOrStar());
      }
      this.expect('OP', ']');
      return N('List', { items }, t.line);
    }
    if (this.atOp('{')){
      this.advance();
      if (this.atOp('}')){ this.advance(); return N('Dict', { keys: [], values: [] }, t.line); }
      if (this.atOp('**')){
        this.advance();
        const v = this.parseOr();
        const keys=[null], values=[v];
        while(this.atOp(',')){ this.advance(); if(this.atOp('}')) break; if(this.atOp('**')){this.advance(); keys.push(null); values.push(this.parseOr());} else { const k=this.parseNamedExpr(); this.expect('OP',':'); keys.push(k); values.push(this.parseNamedExpr()); } }
        this.expect('OP','}');
        return N('Dict', { keys, values }, t.line);
      }
      const firstKey = this.parseNamedExpr();
      if (this.atOp(':')){
        this.advance();
        const firstVal = this.parseNamedExpr();
        if (this.atKw('for')){
          const comp = this.parseCompFor();
          this.expect('OP', '}');
          return N('DictComp', { key: firstKey, value: firstVal, generators: comp }, t.line);
        }
        const keys = [firstKey], values = [firstVal];
        while (this.atOp(',')){
          this.advance();
          if (this.atOp('}')) break;
          const k = this.parseNamedExpr(); this.expect('OP', ':'); const v = this.parseNamedExpr();
          keys.push(k); values.push(v);
        }
        this.expect('OP', '}');
        return N('Dict', { keys, values }, t.line);
      } else {
        if (this.atKw('for')){
          const comp = this.parseCompFor();
          this.expect('OP', '}');
          return N('SetComp', { element: firstKey, generators: comp }, t.line);
        }
        const items = [firstKey];
        while (this.atOp(',')){
          this.advance();
          if (this.atOp('}')) break;
          items.push(this.parseNamedExpr());
        }
        this.expect('OP', '}');
        return N('Set', { items }, t.line);
      }
    }
    if (this.atOp('*')){
      this.advance();
      return N('Starred', { value: this.parseOr() }, t.line);
    }
    throw new ParseError(`Unexpected token ${t.type} '${t.value}' on line ${t.line+1}`, t.line);
  }

  parseNamedExprOrStar(){
    if (this.atOp('*')){ this.advance(); return N('Starred', { value: this.parseOr() }, this.cur().line); }
    return this.parseNamedExpr();
  }

  parseCompFor(){
    const generators = [];
    while (this.atKw('for')){
      this.advance();
      const target = this.parseTargetList();
      this.expect('KEYWORD', 'in');
      const iter = this.parseOr();
      const ifs = [];
      while (this.atKw('if')){ this.advance(); ifs.push(this.parseOr()); }
      generators.push({ target, iter, ifs });
    }
    return generators;
  }

  parseFString(raw, line){
    const parts = [];
    let i = 0, buf = '';
    while (i < raw.length){
      if (raw[i] === '{' && raw[i+1] === '{'){ buf += '{'; i += 2; continue; }
      if (raw[i] === '}' && raw[i+1] === '}'){ buf += '}'; i += 2; continue; }
      if (raw[i] === '{'){
        if (buf){ parts.push({ type:'str', value: unescapeFStr(buf) }); buf=''; }
        let depth = 1; let j = i+1; let exprSrc = '';
        while (j < raw.length && depth > 0){
          if (raw[j] === '{') depth++;
          else if (raw[j] === '}'){ depth--; if (depth===0) break; }
          exprSrc += raw[j]; j++;
        }
        let bang = exprSrc;
        let fmtSpec = '';
        const colonIdx = findTopColon(bang);
        if (colonIdx >= 0){ fmtSpec = bang.slice(colonIdx+1); bang = bang.slice(0, colonIdx); }
        const toks = tokenize(bang + '\n');
        const p = new Parser(toks);
        const exprNode = p.parseNamedExpr();
        parts.push({ type:'expr', node: exprNode, fmt: fmtSpec });
        i = j+1;
        continue;
      }
      buf += raw[i]; i++;
    }
    if (buf) parts.push({ type:'str', value: unescapeFStr(buf) });
    return N('FString', { parts }, line);
  }
}

function findTopColon(s){
  let depth = 0;
  for (let i=0;i<s.length;i++){
    const c = s[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ':' && depth === 0) return i;
  }
  return -1;
}
function unescapeFStr(s){
  return s.replace(/\\n/g,'\n').replace(/\\t/g,'\t');
}

function parse(source){
  const tokens = tokenize(source);
  const p = new Parser(tokens);
  return p.parseModule();
}

const exportObj = { parse, Parser, ParseError };
if (typeof module !== 'undefined') module.exports = exportObj;
else window.PyParser = exportObj;
