
import os
import re

path = 'e:/antigravity/stonecalc/stone_web/index.html'

print(f"Reading {path}...")
with open(path, 'rb') as f:
    content = f.read()

# Decode with replacement to handle bad bytes
text = content.decode('utf-8', errors='replace')

# Fix CSS error (content: '?;)
# The specific pattern might vary due to decoding, so we look for context
# Replaces content: "?; with content: "▶";
text = re.sub(r'content:\s*[\"\'\uFFFD?]+;', 'content: "▶";', text)

# Fix JS error
# Replaces .includes('第四?) with .includes('第四节')
# Handles various ways the ? might appear after decoding
text = text.replace("includes('第四\uFFFD')", "includes('第四节')")
text = text.replace("includes('第四?')", "includes('第四节')")
text = text.replace("includes('第四')", "includes('第四节')") # Fallback if char is just gone

# Ensure we don't accidentally double-fix if run multiple times
text = text.replace("includes('第四节节')", "includes('第四节')")

print("Writing validated UTF-8 content back...")
with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Success: Fixed file encoding and syntax errors.')
