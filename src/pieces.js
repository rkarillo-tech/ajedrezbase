function getPieceHTML(p, style) {
  if (!p || p === ".") return "";
  const isWhite = p === p.toUpperCase();
  const type = p.toUpperCase();

  if (style === "unicode") {
    return `<span class="unicode-piece ${isWhite ? 'w' : 'b'}">${glyphUnicode[p]}</span>`;
  }
  if (style === "disc") {
    const labelES = { K:"R", Q:"D", R:"T", B:"A", N:"C", P:"P" }[type];
    const bg = isWhite ? "#f9fbfd" : "#1e2430";
    const fg = isWhite ? "#18202c" : "#f5f7fa";
    const ring = isWhite ? "#2b3545" : "#cfd8e3";
    return `<svg class="piece-svg" viewBox="0 0 45 45">
      <circle cx="22.5" cy="22.5" r="19" fill="${bg}" stroke="${ring}" stroke-width="2.6"/>
      <text x="22.5" y="29" text-anchor="middle" font-size="19" font-weight="800" fill="${fg}">${labelES}</text>
    </svg>`;
  }
  if (style === "neo") {
    const fill = isWhite ? "#f8fafc" : "#1e2229";
    const stroke = isWhite ? "#1b1f26" : "#e2e8f0";
    const inner = isWhite ? "#1b1f26" : "#f8fafc";
    const shapes = {
      P: `<circle cx="22.5" cy="14" r="6" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/><path d="M13 37 C13 26, 32 26, 32 37 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>`,
      R: `<path d="M12 37 L33 37 L31 20 L34 20 L34 11 L29 11 L29 14 L25 14 L25 11 L20 11 L20 14 L16 14 L16 11 L11 11 L11 20 L14 20 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>`,
      N: `<path d="M13 37 L32 37 C33 25, 30 14, 21 10 L17 7 L16 12 C11 15, 10 21, 15 23 C18 22, 19 19, 22 20 C17 25, 14 30, 13 37 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/><circle cx="17.5" cy="15.5" r="1.6" fill="${inner}"/>`,
      B: `<path d="M12 37 L33 37 C31 29, 29 27, 22.5 27 C16 27, 14 29, 12 37 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/><ellipse cx="22.5" cy="20" rx="7.5" ry="9.5" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/><circle cx="22.5" cy="8.5" r="2.2" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
      Q: `<path d="M11 37 L34 37 L37 15 L29 24 L22.5 12 L16 24 L8 15 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>`,
      K: `<path d="M22.5 5 L22.5 12 M19 8.5 L26 8.5" stroke="${stroke}" stroke-width="2.8" stroke-linecap="round"/><path d="M11 37 L34 37 L35 21 C35 14, 27 14, 22.5 19 C18 14, 10 14, 10 21 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>`
    };
    return `<svg class="piece-svg" viewBox="0 0 45 45">${shapes[type]}</svg>`;
  }

  const fill = isWhite ? "#fdfdfd" : "#22262e";
  const stroke = isWhite ? "#1c1f24" : "#111318";
  const detail = isWhite ? "#1c1f24" : "#d8dee9";
  const staunton = {
    P: `<path d="M 22.5,9 C 19.5,9 17,11.5 17,14.5 C 17,16.8 18.4,18.7 20.4,19.5 C 17,21.2 15,25 15,30 L 30,30 C 30,25 28,21.2 24.6,19.5 C 26.6,18.7 28,16.8 28,14.5 C 28,11.5 25.5,9 22.5,9 z" fill="${fill}" stroke="${stroke}" stroke-width="2"/><path d="M 11.5,37 L 33.5,37 C 33.5,33.5 31,31.5 29,31.5 L 16,31.5 C 14,31.5 11.5,33.5 11.5,37 z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
    R: `<g fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"><path d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z"/><path d="M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z"/><path d="M 14,29.5 L 14,16.5 L 31,16.5 L 31,29.5 L 14,29.5 z"/><path d="M 14,16.5 L 11,14 L 34,14 L 31,16.5 L 14,16.5 z"/><path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14"/></g>`,
    N: `<g fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"><path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18"/><path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10"/></g><circle cx="15.5" cy="14.5" r="1.5" fill="${detail}"/>`,
    B: `<g fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"><path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.06 9,36 9,36 z"/><path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z"/><circle cx="22.5" cy="8" r="2.2"/></g><path d="M 19.5,17.5 L 25.5,17.5 M 22.5,14.5 L 22.5,20.5" stroke="${detail}" stroke-width="1.8" stroke-linecap="round"/>`,
    Q: `<g fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"><path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z"/><path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5 C 17.5,39.5 27.5,39.5 34,38.5 C 34,38.5 35.5,37.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 C 27.5,24.5 17.5,24.5 9,26 z"/></g>`,
    K: `<g fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"><path d="M 22.5,11.63 L 22.5,6" stroke-linecap="round"/><path d="M 20,8 L 25,8" stroke-linecap="round"/><path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25"/><path d="M 11.5,37 C 17,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 19,16 9.5,13 6.5,19.5 C 3.5,25.5 11.5,29.5 11.5,29.5 L 11.5,37 z"/></g>`
  };
  return `<svg class="piece-svg" viewBox="0 0 45 45">${staunton[type]}</svg>`;
}
