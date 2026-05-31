import json, os, re

with open('build/client/assets/manifest-69c84c29.js') as f:
    content = f.read()

# Extract just the JSON — it starts with { and we need to find the matching }
# The manifest is window.__reactRouterManifest={...};
start = content.index('{')
depth = 0
end = start
for i, c in enumerate(content[start:], start):
    if c == '{':
        depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            end = i + 1
            break

json_str = content[start:end]
manifest = json.loads(json_str)

entry_imports = manifest['entry']['imports']
root_imports = manifest['routes']['root']['imports']
all_imports = set(entry_imports + root_imports)

total = 0
for imp in sorted(all_imports):
    fname = 'build/client/' + imp.lstrip('/')
    if os.path.exists(fname):
        size = os.path.getsize(fname)
        total += size
        print(f'{size//1024:>4}KB {imp}')

print(f'\nTotal initial bundle (entry + root deps): {total//1024}KB ({total} bytes)')
print(f'Total files: {len(all_imports)}')

# Also check route count
print(f'\nTotal routes: {len(manifest["routes"])}')
