export const injectCSS = (css: string, url: boolean = false) => {
  let el = document.createElement(url ? 'style' : 'link');
  if (url) {
    el.setAttribute('rel', 'stylesheet');
    el.setAttribute('href', css);
  } else {
    el.innerText = css;
  }
  document.head.appendChild(el);
};

export const injectJS = (js: string, url: boolean = false) => {
  let el = document.createElement('script');
  if (url) {
    el.setAttribute('type', 'module');
    el.setAttribute('src', js);
  } else {
    el.innerText = js;
  }
  document.body.appendChild(el);
};

export const injectFavicon = (src) => {
  var link = document.createElement('link');
  link.id = 'favicon';
  link.rel = 'shortcut icon';
  link.href = src
  document.head.appendChild(link);
}

export const injectFontFamily = (ffUrl) => {
  injectCSS("\
  @font-face {\
      font-family:  Custom;\
      src: url('" + ffUrl + "') format('yourFontFormat');\
  }\
");
}

export const parseAsHtml = (element: string): DocumentFragment => {
  const parse = Range.prototype.createContextualFragment.bind(document.createRange());
  return parse(element)
} 