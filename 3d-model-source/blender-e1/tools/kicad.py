"""Minimal KiCad .kicad_pcb (s-expression) reader."""
import re
TOK = re.compile(r'\(|\)|"(?:[^"\\]|\\.)*"|[^\s()"]+')
def parse(text):
    stack=[[]]
    for m in TOK.finditer(text):
        t=m.group(0)
        if t=='(': stack.append([])
        elif t==')':
            e=stack.pop(); stack[-1].append(e)
        else:
            if t[0]=='"': t=t[1:-1].replace('\\"','"')
            stack[-1].append(t)
    return stack[0][0]
def find(node, key):  return [c for c in node if isinstance(c,list) and c and c[0]==key]
def first(node, key):
    r=find(node,key); return r[0] if r else None
def num(v):
    try: return float(v)
    except: return v
def load(path):
    return parse(open(path, encoding='utf-8').read())
