const withBase = (html: string) => {
  if (typeof window === 'undefined') return html;
  const base = `<base href="${window.location.origin}/">`;
  return html.replace('<head><meta charset="utf-8">', `<head><meta charset="utf-8">${base}`);
};

export function printHillcrestHtml(html: string, title = 'Hillcrest printable') {
  const iframe = document.createElement('iframe');
  iframe.hidden = true;
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error('Could not open the print frame.');
  }
  doc.open();
  doc.write(withBase(html).replace('<head>', `<head><title>${title}</title>`));
  doc.close();
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 2000);
  };
}

export function openHillcrestHtml(html: string, title = 'Hillcrest printable') {
  const tab = window.open('', '_blank');
  if (!tab) return false;
  tab.document.open();
  tab.document.write(withBase(html).replace('<head>', `<head><title>${title}</title>`));
  tab.document.close();
  setTimeout(() => {
    tab.focus();
    tab.print();
  }, 400);
  return true;
}

export function hillcrestHtmlBlob(html: string) {
  return new Blob([withBase(html)], { type: 'text/html;charset=utf-8' });
}
