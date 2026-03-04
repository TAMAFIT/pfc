import re

with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Extract CSS
styles = re.findall(r'<style>(.*?)</style>', text, re.DOTALL)
with open('style.css', 'w', encoding='utf-8') as f:
    for s in styles:
        f.write(s.strip() + '\n\n')

# Remove <style> blocks
text = re.sub(r'\s*<style>.*?</style>', '', text, flags=re.DOTALL)

# 2. Extract JS
scripts = re.findall(r'<script>(.*?)</script>', text, re.DOTALL)

js_content = []
for s in scripts:
    if 'isIOS = ' in s or 'let deferredPrompt;' in s:
        continue # skip tiny initialization scripts or keep them if needed. Actually 'isIOS =' is in the head.
    js_content.append(s.strip())

with open('main-inline.js', 'w', encoding='utf-8') as f:
    f.write('\n\n'.join(js_content))

# Remove the extracted scripts
def replace_script(match):
    if 'isIOS =' in match.group(0) or 'let deferredPrompt;' in match.group(0):
        return match.group(0)
    return ''

text = re.sub(r'\s*<script>.*?</script>', replace_script, text, flags=re.DOTALL)

# Add the script link before </body>
text = text.replace('</body>', '    <script src="main-inline.js"></script>\n</body>')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(text.strip() + '\n')

print('Refactoring Python Script Completed')
