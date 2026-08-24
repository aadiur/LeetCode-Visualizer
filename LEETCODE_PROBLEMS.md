# 🎯 Best LeetCode Problems to Visualize with AIR Visualizer

## Copy-Paste These & Watch Them Animate!

---

## 🟢 EASY (Great for Learning)

### 1️⃣ LeetCode 1: Two Sum
**Difficulty**: Easy  
**Link**: https://leetcode.com/problems/two-sum/

```cpp
vector<int> nums = {2, 7, 11, 15};
int target = 9;
vector<int> result;
for(int i=0;i<nums.size();i++){
  for(int j=i+1;j<nums.size();j++){
    if(nums[i]+nums[j]==target){
      result.push_back(i);
      result.push_back(j);
    }
  }
}
```

**What You'll See Animate:**
- Array: [2, 7, 11, 15]
- Nested loops with pointers i, j
- If condition checking sums
- Result array growing: [0, 1]

---

### 2️⃣ LeetCode 26: Remove Duplicates from Sorted Array
**Difficulty**: Easy  
**Link**: https://leetcode.com/problems/remove-duplicates-from-sorted-array/

```cpp
vector<int> nums = {1, 1, 2, 2, 3};
int k = 0;
for(int i=1;i<nums.size();i++){
  if(nums[i]!=nums[k]){
    k++;
    nums[k] = nums[i];
  }
}
```

**What You'll See Animate:**
- Array: [1, 1, 2, 2, 3]
- Pointer k tracking unique elements
- Array elements updating
- Final result: [1, 2, 3]

---

### 3️⃣ LeetCode 121: Best Time to Buy and Sell Stock
**Difficulty**: Easy  
**Link**: https://leetcode.com/problems/best-time-to-buy-and-sell-stock/

```cpp
vector<int> prices = {7, 1, 5, 3, 6, 4};
int minPrice = 9999;
int maxProfit = 0;
for(int i=0;i<prices.size();i++){
  if(prices[i]<minPrice) minPrice = prices[i];
  int profit = prices[i] - minPrice;
  if(profit>maxProfit) maxProfit = profit;
}
```

**What You'll See Animate:**
- Array: [7, 1, 5, 3, 6, 4]
- Variables (minPrice, maxProfit) updating
- Loop iterating through prices
- Final maxProfit: 5

---

### 4️⃣ LeetCode 217: Contains Duplicate
**Difficulty**: Easy  
**Link**: https://leetcode.com/problems/contains-duplicate/

```cpp
vector<int> nums = {1, 2, 3, 1};
bool hasDuplicate = false;
for(int i=0;i<nums.size();i++){
  for(int j=i+1;j<nums.size();j++){
    if(nums[i]==nums[j]){
      hasDuplicate = true;
    }
  }
}
```

**What You'll See Animate:**
- Array: [1, 2, 3, 1]
- Nested loop comparing elements
- Variable hasDuplicate becomes true
- When match found at indices 0 and 3

---

### 5️⃣ LeetCode 88: Merge Sorted Array
**Difficulty**: Easy  
**Link**: https://leetcode.com/problems/merge-sorted-array/

```cpp
vector<int> nums1 = {1, 2, 3, 0, 0, 0};
vector<int> nums2 = {2, 5, 6};
vector<int> result;
int i = 0, j = 0;
while(i<3 && j<3){
  if(nums1[i]<nums2[j]){
    result.push_back(nums1[i]);
    i++;
  } else {
    result.push_back(nums2[j]);
    j++;
  }
}
```

**What You'll See Animate:**
- Two arrays side by side
- Two pointers (i, j) converging
- Result array growing: [1, 2, 2, ...]
- While loop with conditional branching

---

## 🟡 MEDIUM (Best Visualizations)

### 6️⃣ LeetCode 11: Container With Most Water
**Difficulty**: Medium  
**Link**: https://leetcode.com/problems/container-with-most-water/

```cpp
vector<int> height = {1, 8, 6, 2, 5, 4, 8, 3, 7};
int maxArea = 0;
int left = 0;
int right = height.size()-1;
while(left<right){
  int h = height[left] < height[right] ? height[left] : height[right];
  int area = h * (right - left);
  if(area>maxArea) maxArea = area;
  if(height[left]<height[right]) left++;
  else right--;
}
```

**What You'll See Animate:**
- Array: [1, 8, 6, 2, 5, 4, 8, 3, 7]
- **TWO POINTERS CONVERGING** (super visual!)
- Variables (h, area, maxArea) updating
- Pointers moving left/right based on conditions
- **BEST ANIMATION FOR THIS PROBLEM**

---

### 7️⃣ LeetCode 15: 3Sum
**Difficulty**: Medium  
**Link**: https://leetcode.com/problems/3sum/

```cpp
vector<int> nums = {-1, 0, 1, 2, -1, -2};
int target = 0;
for(int i=0;i<nums.size();i++){
  for(int j=i+1;j<nums.size();j++){
    for(int k=j+1;k<nums.size();k++){
      if(nums[i]+nums[j]+nums[k]==target){
        // found triplet
      }
    }
  }
}
```

**What You'll See Animate:**
- Array: [-1, 0, 1, 2, -1, -2]
- **TRIPLE NESTED LOOPS** (i, j, k pointers)
- Pointers moving through array
- Condition checking

---

### 8️⃣ LeetCode 42: Trapping Rain Water
**Difficulty**: Hard (but works!)  
**Link**: https://leetcode.com/problems/trapping-rain-water/

```cpp
vector<int> height = {0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1};
int water = 0;
for(int i=1;i<height.size()-1;i++){
  int leftMax = 0, rightMax = 0;
  for(int j=0;j<=i;j++){
    if(height[j]>leftMax) leftMax = height[j];
  }
  for(int j=i;j<height.size();j++){
    if(height[j]>rightMax) rightMax = height[j];
  }
  int trapped = (leftMax < rightMax ? leftMax : rightMax) - height[i];
  if(trapped>0) water += trapped;
}
```

**What You'll See Animate:**
- Array: [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]
- Loop with nested comparisons
- Variables (leftMax, rightMax) updating
- Water accumulating
- **COMPLEX BUT SATISFYING TO WATCH**

---

### 9️⃣ LeetCode 135: Candy
**Difficulty**: Medium  
**Link**: https://leetcode.com/problems/candy/

```cpp
vector<int> ratings = {1, 0, 2};
vector<int> candies = {1, 1, 1};
for(int i=1;i<ratings.size();i++){
  if(ratings[i]>ratings[i-1]){
    candies[i] = candies[i-1] + 1;
  }
}
for(int i=ratings.size()-2;i>=0;i--){
  if(ratings[i]>ratings[i+1]){
    int newVal = candies[i+1] + 1;
    if(newVal>candies[i]) candies[i] = newVal;
  }
}
```

**What You'll See Animate:**
- Two arrays updating
- Forward pass: candies array changing
- Backward pass: candies array updating again
- Variables jumping around

---

### 🔟 LeetCode 48: Rotate Image
**Difficulty**: Medium  
**Link**: https://leetcode.com/problems/rotate-image/

```cpp
vector<vector<int>> matrix = {{1,2,3},{4,5,6},{7,8,9}};
int n = 3;
for(int i=0;i<n/2;i++){
  for(int j=i;j<n-1-i;j++){
    int tmp = matrix[i][j];
    matrix[i][j] = matrix[n-1-j][i];
    matrix[n-1-j][i] = matrix[n-1-i][n-1-j];
    matrix[n-1-i][n-1-j] = matrix[j][n-1-i];
    matrix[j][n-1-i] = tmp;
  }
}
```

**What You'll See Animate:**
- 2D array rotations
- Complex element swaps
- Variables updating
- **GREAT FOR UNDERSTANDING ROTATION LOGIC**

---

## 📊 STACK/QUEUE PROBLEMS

### 1️⃣1️⃣ LeetCode 20: Valid Parentheses
**Difficulty**: Easy  
**Link**: https://leetcode.com/problems/valid-parentheses/

```cpp
string s = "()[]{}";
vector<char> st;  // stack
bool valid = true;
for(int i=0;i<s.length();i++){
  if(s[i]=='(' || s[i]=='[' || s[i]=='{'){
    st.push_back(s[i]);
  } else {
    if(st.empty()){
      valid = false;
    } else {
      char top = st.back();
      st.pop_back();
      if((s[i]==')' && top!='(') || 
         (s[i]==']' && top!='[') ||
         (s[i]=='}' && top!='{')){
        valid = false;
      }
    }
  }
}
```

**What You'll See Animate:**
- **STACK GROWING** (push operations)
- **STACK SHRINKING** (pop operations)
- Stack visualization on right panel
- "TOP" pointer moving
- **EXCELLENT FOR UNDERSTANDING STACKS**

---

### 1️⃣2️⃣ LeetCode 225: Implement Stack using Queues
**Difficulty**: Easy  
**Link**: https://leetcode.com/problems/implement-stack-using-queues/

```cpp
vector<int> queue;  // queue
queue.push_back(1);
queue.push_back(2);
queue.push_back(3);
// pop removes from end (for stack behavior)
if(queue.size()>0){
  int top = queue.back();
  queue.pop_back();
}
```

**What You'll See Animate:**
- Queue with front/back markers
- Push operations at back
- Pop operations
- **QUEUE VISUALIZATION CLEAR**

---

## 🏆 BEST ONES TO START WITH

If you want to see the **best animations**, try these in order:

### Beginner (Easy & Beautiful):
1. **LeetCode 1: Two Sum** — Nested loops, easy to follow
2. **LeetCode 121: Best Time to Buy and Sell Stock** — Variables updating clearly
3. **LeetCode 26: Remove Duplicates** — Array mutation visible

### Intermediate (Cool Animations):
4. **LeetCode 11: Container With Most Water** — ⭐ **BEST TWO-POINTER ANIMATION**
5. **LeetCode 20: Valid Parentheses** — ⭐ **BEST STACK ANIMATION**
6. **LeetCode 42: Trapping Rain Water** — Complex but satisfying

### Advanced (Mind-Bending):
7. **LeetCode 48: Rotate Image** — Matrix rotations are cool to watch
8. **LeetCode 135: Candy** — Multiple passes over array

---

## How to Use

1. **Open** `leetcode-visualizer.html`
2. **Click** "Blank — write your own"
3. **Copy-paste** any code above
4. **Watch** it animate in real-time

Example: Paste the **LeetCode 11** code, then:
- See array appear
- Watch pointers converge from both ends
- See maxArea variable update
- Watch while loop execute
- See final result

---

## 🎯 My Top 3 Recommendations

### #1: LeetCode 11 - Container With Most Water
```cpp
vector<int> height = {1, 8, 6, 2, 5, 4, 8, 3, 7};
int maxArea = 0;
int left = 0;
int right = height.size()-1;
while(left<right){
  int h = height[left] < height[right] ? height[left] : height[right];
  int area = h * (right - left);
  if(area>maxArea) maxArea = area;
  if(height[left]<height[right]) left++;
  else right--;
}
```
**Why:** Pointers converging is SUPER visual. You'll see left and right move toward center. Variables updating. Conditional logic. **PERFECT for seeing two-pointer technique.**

---

### #2: LeetCode 20 - Valid Parentheses
```cpp
string s = "()[]{}";
vector<char> st;  // stack
for(int i=0;i<s.length();i++){
  if(s[i]=='(' || s[i]=='[' || s[i]=='{'){
    st.push_back(s[i]);
  } else {
    if(!st.empty()){
      char top = st.back();
      st.pop_back();
    }
  }
}
```
**Why:** Stack growing and shrinking. TOP pointer moving. Push and pop animations. **PERFECT for understanding stacks.**

---

### #3: LeetCode 1 - Two Sum
```cpp
vector<int> nums = {2, 7, 11, 15};
int target = 9;
for(int i=0;i<nums.size();i++){
  for(int j=i+1;j<nums.size();j++){
    if(nums[i]+nums[j]==target){
      // found
    }
  }
}
```
**Why:** Easiest to understand. Nested loops visible. Pointers (i, j) moving. Condition checking. **PERFECT for beginners.**

---

## 🚀 Try This Right Now

1. Open the HTML
2. Paste this code:

```cpp
vector<int> height = {1, 8, 6, 2, 5, 4, 8, 3, 7};
int maxArea = 0;
int left = 0;
int right = height.size()-1;
while(left<right){
  int h = height[left] < height[right] ? height[left] : height[right];
  int area = h * (right - left);
  if(area>maxArea) maxArea = area;
  if(height[left]<height[right]) left++;
  else right--;
}
```

3. **Click ▶ Play**
4. **Watch the pointers converge**
5. **See maxArea update**
6. **Understand the algorithm visually**

---

## Summary Table

| # | Problem | Difficulty | Best For | Link |
|---|---------|-----------|----------|------|
| 1 | Two Sum | Easy | Nested loops | https://leetcode.com/problems/two-sum/ |
| 11 | Container Water | Medium | ⭐ Two pointers | https://leetcode.com/problems/container-with-most-water/ |
| 20 | Valid Parentheses | Easy | ⭐ Stacks | https://leetcode.com/problems/valid-parentheses/ |
| 26 | Remove Duplicates | Easy | Array mutation | https://leetcode.com/problems/remove-duplicates-from-sorted-array/ |
| 42 | Trapping Rain Water | Hard | Complex loops | https://leetcode.com/problems/trapping-rain-water/ |
| 48 | Rotate Image | Medium | Matrix | https://leetcode.com/problems/rotate-image/ |
| 88 | Merge Arrays | Easy | Two pointers | https://leetcode.com/problems/merge-sorted-array/ |
| 121 | Buy/Sell Stock | Easy | Variables | https://leetcode.com/problems/best-time-to-buy-and-sell-stock/ |
| 135 | Candy | Medium | Multiple passes | https://leetcode.com/problems/candy/ |
| 217 | Contains Duplicate | Easy | Nested search | https://leetcode.com/problems/contains-duplicate/ |

---

**Pick any problem above, copy the code, paste into the visualizer, and watch it animate!** 🎨✨

