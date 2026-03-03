import re
import os
import glob

html_file = 'index.html'
js_files = ['main-inline.js', 'app.js', 'tamachan-data.js', 'ai.js', 'database.js']

with open(html_file, 'r', encoding='utf-8') as f:
    html_content = f.read()

# 1. Find all HTML IDs
html_ids = set(re.findall(r'id=["\']([^"\']+)["\']', html_content))

# 2. Find all JS functions called in HTML (onclick, onchange, etc.)
html_js_calls = set()
for match in re.finditer(r'on[a-z]+=["\']([a-zA-Z0-9_]+)\(', html_content):
    html_js_calls.add(match.group(1))

js_content = ""
for js_f in js_files:
    if os.path.exists(js_f):
        with open(js_f, 'r', encoding='utf-8') as f:
            js_content += f.read() + "\n"

# 3. Find all defined JS functions
js_funcs = set(re.findall(r'function\s+([a-zA-Z0-9_]+)\s*\(', js_content))
js_funcs.update(re.findall(r'(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:function|(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>)', js_content))
js_funcs.update(re.findall(r'window\.([a-zA-Z0-9_]+)\s*=', js_content))

# 4. Find all getElementById calls in JS
js_element_ids = set(re.findall(r'getElementById\([\'"]([^\'"]+)[\'"]\)', js_content))

print("=== Missing Functions Analysis ===")
missing_funcs = html_js_calls - js_funcs
if missing_funcs:
    print(f"WARNING: The following functions are called in HTML but not defined in JS: {missing_funcs}")
else:
    print("OK: All functions called in HTML are defined in JS.")

print("\n=== Missing Element IDs Analysis ===")
missing_ids = js_element_ids - html_ids
# Filter out dynamically created IDs or common false positives if necessary
# But let's just print them all first for review
if missing_ids:
    print(f"WARNING: The following IDs are queried in JS but missing from HTML: {sorted(list(missing_ids))}")
else:
    print("OK: All IDs queried in JS exist in HTML.")

