"use strict";
// Run with: node tests/test_suite.js   (from the extension package root)
const { parse } = require('../engine/parser.js');
const { Interpreter } = require('../engine/interpreter.js');

let pass = 0, fail = 0;
function run(src, label, expect){
  try {
    const ast = parse(src);
    const interp = new Interpreter({ maxSteps: 20000, maxMs: 8000 });
    const gen = interp.execBody(ast.body, interp.globals);
    let r = gen.next();
    while(!r.done) r = gen.next();
    const out = interp.output.join('|');
    const ok = out === expect;
    if (ok) pass++; else fail++;
    console.log((ok?'PASS ':'FAIL ') + label + ' -> ' + out + (ok?'':(' | expected: '+expect)));
  } catch(e) {
    fail++;
    console.log('ERR  ' + label + ': ' + e.name + ' ' + e.message);
  }
}

run(`
def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target-n], i]
        seen[n] = i
    return []
print(two_sum([2,7,11,15], 9))
`, 'Two Sum', '[0, 1]');

run(`
def search(nums, target):
    lo, hi = 0, len(nums)-1
    while lo <= hi:
        mid = (lo+hi)//2
        if nums[mid] == target: return mid
        elif nums[mid] < target: lo = mid+1
        else: hi = mid-1
    return -1
print(search([-1,0,3,5,9,12], 9))
`, 'Binary Search', '4');

run(`
def max_profit(prices):
    best = 0
    lo = prices[0]
    for p in prices[1:]:
        if p < lo: lo = p
        else: best = max(best, p-lo)
    return best
print(max_profit([7,1,5,3,6,4]))
`, 'Best Time to Buy/Sell Stock', '5');

run(`
def spiral(matrix):
    res = []
    while matrix:
        res += matrix.pop(0)
        if matrix and matrix[0]:
            for row in matrix:
                res.append(row.pop())
        if matrix:
            res += matrix.pop()[::-1]
        if matrix and matrix[0]:
            for row in matrix[::-1]:
                res.append(row.pop(0))
    return res
print(spiral([[1,2,3],[4,5,6],[7,8,9]]))
`, 'Spiral Matrix', '[1, 2, 3, 6, 9, 8, 7, 4, 5]');

run(`
def set_zeroes(matrix):
    rows, cols = set(), set()
    for i in range(len(matrix)):
        for j in range(len(matrix[0])):
            if matrix[i][j] == 0:
                rows.add(i); cols.add(j)
    for i in range(len(matrix)):
        for j in range(len(matrix[0])):
            if i in rows or j in cols:
                matrix[i][j] = 0
    return matrix
print(set_zeroes([[1,1,1],[1,0,1],[1,1,1]]))
`, 'Set Matrix Zeroes', '[[1, 0, 1], [0, 0, 0], [1, 0, 1]]');

run(`
def num_islands(grid):
    rows, cols = len(grid), len(grid[0])
    seen = set()
    def dfs(r,c):
        if r<0 or c<0 or r>=rows or c>=cols or (r,c) in seen or grid[r][c]=='0': return
        seen.add((r,c))
        dfs(r+1,c); dfs(r-1,c); dfs(r,c+1); dfs(r,c-1)
    n = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c]=='1' and (r,c) not in seen:
                dfs(r,c); n += 1
    return n
print(num_islands([['1','1','0','0'],['1','1','0','0'],['0','0','1','0'],['0','0','0','1']]))
`, 'Number of Islands', '3');

run(`
def is_valid(s):
    stack = []
    pairs = {')':'(', ']':'[', '}':'{'}
    for c in s:
        if c in '([{':
            stack.append(c)
        elif not stack or stack.pop() != pairs[c]:
            return False
    return not stack
print(is_valid("()[]{}"))
print(is_valid("(]"))
print(is_valid("([)]"))
`, 'Valid Parentheses', 'True|False|False');

run(`
def daily_temperatures(t):
    res = [0]*len(t)
    stack = []
    for i, x in enumerate(t):
        while stack and t[stack[-1]] < x:
            j = stack.pop()
            res[j] = i - j
        stack.append(i)
    return res
print(daily_temperatures([73,74,75,71,69,72,76,73]))
`, 'Daily Temperatures', '[1, 1, 4, 2, 1, 1, 0, 0]');

run(`
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val; self.next = next
def build(vals):
    dummy = ListNode(); cur = dummy
    for v in vals: cur.next = ListNode(v); cur = cur.next
    return dummy.next
def to_list(h):
    out = []
    while h: out.append(h.val); h = h.next
    return out
def reverse_list(head):
    prev = None
    while head:
        nxt = head.next
        head.next = prev
        prev = head
        head = nxt
    return prev
print(to_list(reverse_list(build([1,2,3,4,5]))))
`, 'Reverse Linked List', '[5, 4, 3, 2, 1]');

run(`
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val; self.next = next
def build(vals):
    dummy = ListNode(); cur = dummy
    for v in vals: cur.next = ListNode(v); cur = cur.next
    return dummy.next
def to_list(h):
    out = []
    while h: out.append(h.val); h = h.next
    return out
def merge(l1, l2):
    dummy = ListNode(); cur = dummy
    while l1 and l2:
        if l1.val <= l2.val:
            cur.next = l1; l1 = l1.next
        else:
            cur.next = l2; l2 = l2.next
        cur = cur.next
    cur.next = l1 if l1 else l2
    return dummy.next
print(to_list(merge(build([1,2,4]), build([1,3,4]))))
`, 'Merge Two Sorted Lists', '[1, 1, 2, 3, 4, 4]');

run(`
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val; self.left = left; self.right = right
def max_depth(root):
    if not root: return 0
    return 1 + max(max_depth(root.left), max_depth(root.right))
root = TreeNode(3, TreeNode(9), TreeNode(20, TreeNode(15), TreeNode(7)))
print(max_depth(root))
`, 'Max Depth of Binary Tree', '3');

run(`
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val; self.left = left; self.right = right
def invert(root):
    if not root: return None
    root.left, root.right = invert(root.right), invert(root.left)
    return root
def preorder(root):
    if not root: return []
    return [root.val] + preorder(root.left) + preorder(root.right)
root = TreeNode(4, TreeNode(2, TreeNode(1), TreeNode(3)), TreeNode(7, TreeNode(6), TreeNode(9)))
print(preorder(invert(root)))
`, 'Invert Binary Tree', '[4, 7, 9, 6, 2, 3, 1]');

run(`
class Node:
    def __init__(self, val, neighbors=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []
def clone(node, seen=None):
    if seen is None: seen = {}
    if node.val in seen: return seen[node.val]
    copy = Node(node.val)
    seen[node.val] = copy
    for nb in node.neighbors:
        copy.neighbors.append(clone(nb, seen))
    return copy
a=Node(1); b=Node(2); c=Node(3)
a.neighbors=[b,c]; b.neighbors=[a,c]; c.neighbors=[a,b]
d = clone(a)
print(d.val, sorted([n.val for n in d.neighbors]))
`, 'Clone Graph', '1 [2, 3]');

run(`
def merge_sort(arr):
    if len(arr) <= 1: return arr
    mid = len(arr)//2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    res = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]: res.append(left[i]); i += 1
        else: res.append(right[j]); j += 1
    res += left[i:]; res += right[j:]
    return res
print(merge_sort([5,2,8,1,9,3,7]))
`, 'Merge Sort', '[1, 2, 3, 5, 7, 8, 9]');

run(`
def three_sum(nums):
    nums.sort()
    res = []
    n = len(nums)
    for i in range(n):
        if i > 0 and nums[i] == nums[i-1]: continue
        l, r = i+1, n-1
        while l < r:
            s = nums[i] + nums[l] + nums[r]
            if s < 0: l += 1
            elif s > 0: r -= 1
            else:
                res.append([nums[i], nums[l], nums[r]])
                l += 1
                while l < r and nums[l] == nums[l-1]: l += 1
    return res
print(three_sum([-1,0,1,2,-1,-4]))
`, '3Sum', '[[-1, -1, 2], [-1, 0, 1]]');

run(`
def merge_intervals(intervals):
    intervals.sort(key=lambda x: x[0])
    res = [intervals[0]]
    for cur in intervals[1:]:
        last = res[-1]
        if cur[0] <= last[1]:
            last[1] = max(last[1], cur[1])
        else:
            res.append(cur)
    return res
print(merge_intervals([[1,3],[2,6],[8,10],[15,18]]))
`, 'Merge Intervals', '[[1, 6], [8, 10], [15, 18]]');

run(`
def koko(piles, h):
    lo, hi = 1, max(piles)
    while lo < hi:
        mid = (lo+hi)//2
        hours = sum((p + mid - 1)//mid for p in piles)
        if hours <= h: hi = mid
        else: lo = mid+1
    return lo
print(koko([3,6,7,11], 8))
`, 'Koko Eating Bananas', '4');

// --- regression test for the grid-vs-adjacency-list role classifier ---
{
  const { runPython, computeRoles, pickVizVars } = require('../engine/engine.js');
  function checkRole(label, src, varName, expectedKind, expectedOutput){
    const res = runPython(src, { maxSteps: 10000, maxMs: 8000 });
    if (res.error){ fail++; console.log('ERR  ' + label + ': ' + res.error.type + ' ' + res.error.message); return; }
    const out = res.output.join('|');
    const roles = computeRoles(res.steps);
    const last = res.steps[res.steps.length - 1];
    const vv = pickVizVars(last, roles);
    const v = vv.find(x => x.name === varName);
    const kindOk = v && v.kind === expectedKind;
    const outOk = out === expectedOutput;
    if (kindOk && outOk){ pass++; console.log('PASS ' + label + ' -> ' + varName + ':' + (v&&v.kind) + ', output=' + out); }
    else { fail++; console.log('FAIL ' + label + ' -> ' + varName + ':' + (v&&v.kind) + ' (expected ' + expectedKind + '), output=' + out + ' (expected ' + expectedOutput + ')'); }
  }

  checkRole('Adjacency-list graph classifies as adjacency_list (not grid)', `
def dfs(graph, vertex, visited):
    visited[vertex] = True
    print(vertex, end=' ')
    for neighbour in graph[vertex]:
        if visited[neighbour] == False:
            dfs(graph, neighbour, visited)
V = 7
graph = [[] for i in range(V)]
graph[0].append(1); graph[0].append(2)
graph[1].append(0); graph[1].append(3); graph[1].append(4)
graph[2].append(0); graph[2].append(5)
graph[3].append(1); graph[4].append(1); graph[4].append(6)
graph[5].append(2); graph[6].append(4)
visited = [False]*V
dfs(graph, 0, visited)
`, 'graph', 'adjacency_list', '0 1 3 4 6 2 5 ');

  checkRole('Binary island grid classifies as grid (not adjacency_list)', `
def numIslands(grid):
    rows, cols = len(grid), len(grid[0])
    visited = set()
    def dfs(i, j):
        if i<0 or j<0 or i>=rows or j>=cols or (i,j) in visited or grid[i][j]==0:
            return
        visited.add((i,j))
        dfs(i+1,j); dfs(i-1,j); dfs(i,j+1); dfs(i,j-1)
    count = 0
    for i in range(rows):
        for j in range(cols):
            if grid[i][j]==1 and (i,j) not in visited:
                dfs(i,j)
                count += 1
    return count
grid = [[1,1,0],[0,1,0],[0,0,1]]
print(numIslands(grid))
`, 'grid', 'grid', '2');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
