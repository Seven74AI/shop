#!/usr/bin/env python3
"""
Transform route files to use React Router v7 lazy loading.
For each route .tsx file with a default export (Component):
1. Extract the Component + ErrorBoundary + helper components into .lazy.tsx
2. Keep loader/action/meta + lazy export in the original
"""

import os
import re
import sys

ROOT = '/root/.hermes/kanban/boards/shop/workspaces/t_76930df5'

def extract_component_section(content, filepath):
    """Extract the component section (default export + ErrorBoundary + helpers)."""
    lines = content.split('\n')
    
    # Find the export default line
    default_idx = None
    for i, line in enumerate(lines):
        if re.match(r'^export default function\b', line):
            default_idx = i
            break
    
    if default_idx is None:
        return None, None, None
    
    # The server section is everything before the default export
    server_lines = lines[:default_idx]
    
    # Find where the component section ends
    # Look for export function ErrorBoundary that comes AFTER the default export
    # First, find the end of the default export (closing brace at column 0)
    brace_depth = 0
    in_default = False
    component_end = len(lines)
    
    for i in range(default_idx, len(lines)):
        line = lines[i]
        if not in_default and 'export default function' in line:
            in_default = True
        if in_default:
            brace_depth += line.count('{') - line.count('}')
        if in_default and brace_depth == 0 and i > default_idx:
            component_end = i + 1
            break
    
    # Everything from default_idx to component_end is the component section
    # But we need to include ErrorBoundary if it's AFTER this
    error_boundary_start = None
    error_boundary_end = None
    
    for i in range(component_end, len(lines)):
        if re.match(r'^export function ErrorBoundary\b', lines[i]):
            error_boundary_start = i
            # Find end
            ebd = 0
            for j in range(i, len(lines)):
                ebd += lines[j].count('{') - lines[j].count('}')
                if ebd == 0 and j > i:
                    error_boundary_end = j + 1
                    break
            break
    
    # Build the component section
    component_lines = lines[default_idx:component_end]
    if error_boundary_start:
        component_lines.extend(lines[error_boundary_start:error_boundary_end])
    
    # Server section (everything before default, minus any ErrorBoundary)
    server_section = '\n'.join(server_lines).rstrip()
    
    # Component section
    component_section = '\n'.join(component_lines)
    
    # Extract client-side imports for the lazy file
    client_imports = extract_client_imports(server_section, component_section, filepath)
    
    return server_section, component_section, client_imports

def extract_client_imports(server_section, component_section, filepath):
    """Determine which imports go in the .lazy.tsx file."""
    imports = []
    
    # Parse all imports from the original file
    all_content = server_section + '\n' + component_section
    
    # Known client-side packages
    client_packages = [
        'react', 'react-router', 'react-dom',
        '@conform-to/react', '@conform-to/zod',
    ]
    
    # Known client-side app imports
    client_app_patterns = [
        r'#app/components/',
        r'#app/utils/misc\.tsx',
        r'#app/utils/i18n\.tsx',
        r'#app/schemas/',
    ]
    
    # Collect all import lines
    import_lines = []
    for line in all_content.split('\n'):
        stripped = line.strip()
        if stripped.startswith('import ') and 'from ' in stripped:
            import_lines.append(line)
    
    # Determine which are client-only
    # For simplicity, check if the imported symbols are used in the component section
    for line in import_lines:
        # Extract the import source
        m = re.search(r'from\s+[\'"]([^\'"]+)[\'"]', line)
        if not m:
            continue
        source = m.group(1)
        
        # Extract imported symbols
        symbols = []
        if line.strip().startswith('import type'):
            # Type imports are shared (no runtime cost)
            pass
        elif '{' in line:
            # Named imports: import { X, Y } from '...'
            sym_match = re.search(r'import\s+\{([^}]+)\}', line)
            if sym_match:
                symbols = [s.strip().split(' as ')[0].strip() for s in sym_match.group(1).split(',')]
        
        # Check if source is a client package
        is_client = any(source.startswith(pkg) for pkg in client_packages)
        
        # Check if source matches client app patterns
        is_client = is_client or any(re.match(pat, source) for pat in client_app_patterns)
        
        if is_client and symbols:
            # Check that at least one symbol is used in the component section
            used = any(sym in component_section for sym in symbols)
            if used:
                imports.append(line)
    
    return '\n'.join(imports)

def get_lazy_filename(original_path):
    """Get the .lazy.tsx filename from the original."""
    base = os.path.basename(original_path)
    name, ext = os.path.splitext(base)
    return f"{name}.lazy{ext}"

def transform_file(filepath):
    """Transform a single route file."""
    with open(filepath, 'r') as f:
        content = f.read()
    
    server_section, component_section, client_imports = extract_component_section(content, filepath)
    
    if server_section is None:
        print(f"SKIP (no default export): {filepath}")
        return False
    
    # Get the type import for the route
    type_import_line = None
    for line in server_section.split('\n'):
        if 'type Route' in line and 'from ' in line and '+types' in line:
            type_import_line = line
            break
    
    if type_import_line is None:
        # Try to find from the original file
        for line in content.split('\n'):
            if 'type Route' in line and 'from ' in line and '+types' in line:
                type_import_line = line
                break
    
    # Get the lazy filename
    lazy_filename = get_lazy_filename(filepath)
    lazy_basename = os.path.splitext(lazy_filename)[0]
    
    # Build the lazy file content
    # We need to collect the imports the Component needs
    lazy_content_parts = []
    lazy_content_parts.append(f"// Lazy-loaded component for {os.path.basename(filepath)}")
    lazy_content_parts.append(f"// Auto-generated by transform-lazy.py")
    lazy_content_parts.append("")
    
    # Add type import
    if type_import_line:
        lazy_content_parts.append(type_import_line)
    
    # Add React import
    lazy_content_parts.append("import React from 'react'")
    
    # Add client imports
    if client_imports:
        lazy_content_parts.append(client_imports)
    
    lazy_content_parts.append("")
    
    # Add a note about how to use
    dirname = os.path.dirname(filepath)
    lazy_content_parts.append(f"// This component is lazy-loaded from {os.path.basename(filepath)}")
    lazy_content_parts.append("")
    
    # Add the component section
    lazy_content_parts.append(component_section)
    
    lazy_content = '\n'.join(lazy_content_parts) + '\n'
    
    # Write the .lazy.tsx file
    lazy_path = os.path.join(dirname, lazy_filename)
    with open(lazy_path, 'w') as f:
        f.write(lazy_content)
    
    # Build the new original file content (server section + lazy export)
    new_content_parts = []
    new_content_parts.append(server_section)
    new_content_parts.append("")
    new_content_parts.append(f"// Lazy-load the component for code splitting")
    new_content_parts.append(f"// Auto-generated by transform-lazy.py")
    new_content_parts.append(f"export const lazy = () => import('./{lazy_basename}')")
    new_content_parts.append("")
    
    new_content = '\n'.join(new_content_parts) + '\n'
    
    with open(filepath, 'w') as f:
        f.write(new_content)
    
    print(f"OK: {filepath} -> {lazy_path}")
    return True

def main():
    # Get all route files with Components (no tests, no server-only)
    files_to_transform = []
    
    for root, dirs, files in os.walk(os.path.join(ROOT, 'app/routes/admin+')):
        for f in files:
            if f.endswith('.tsx') and '.test.' not in f and '.server.' not in f and not f.startswith('__'):
                filepath = os.path.join(root, f)
                with open(filepath, 'r') as fh:
                    content = fh.read()
                if 'export default function' in content:
                    files_to_transform.append(filepath)
    
    for root, dirs, files in os.walk(os.path.join(ROOT, 'app/routes/shop+/checkout+')):
        for f in files:
            if f.endswith('.tsx') and '.test.' not in f and '.server.' not in f and not f.startswith('__'):
                filepath = os.path.join(root, f)
                with open(filepath, 'r') as fh:
                    content = fh.read()
                if 'export default function' in content:
                    files_to_transform.append(filepath)
    
    print(f"Files to transform: {len(files_to_transform)}")
    
    count = 0
    for filepath in sorted(files_to_transform):
        if transform_file(filepath):
            count += 1
    
    print(f"\nTransformed {count} files.")

if __name__ == '__main__':
    main()
