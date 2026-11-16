export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', { class: cls }, label);
  b.addEventListener('click', onClick);
  return b;
}

export function field(label: string, input: HTMLElement): HTMLElement {
  return el('label', { class: 'field' }, el('span', {}, label), input);
}

export function numberInput(value: number | null, placeholder = ''): HTMLInputElement {
  const i = el('input', { type: 'number', step: 'any', placeholder });
  if (value !== null) i.value = String(value);
  return i;
}
