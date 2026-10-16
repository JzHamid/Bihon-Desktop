// Generated public-domain test text; no downloaded book or private library is used.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const files = [], directory = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const filename = Buffer.from(name), data = Buffer.from(content), crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    files.push(header, filename, data);
    directory.push(central, filename);
    offset += header.length + filename.length + data.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, central, end]);
}

function makeEpub() {
  const chapters = [1, 2, 3];
  const xhtml = (title, body) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en"><head><title>${title}</title></head><body>${body}</body></html>`;
  return zip([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ['EPUB/package.opf', `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:bihon:packaged-smoke</dc:identifier><dc:title>Bihon Smoke Book</dc:title><dc:creator>Bihon Test Fixture</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${chapters.map(number => `<item id="c${number}" href="chapter${number}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map(number => `<itemref idref="c${number}"/>`).join('')}</spine></package>`],
    ['EPUB/nav.xhtml', xhtml('Contents', `<nav epub:type="toc"><h1>Contents</h1><ol>${chapters.map(number => `<li><a href="chapter${number}.xhtml">Chapter ${number}</a></li>`).join('')}</ol></nav>`)],
    ...chapters.map(number => [`EPUB/chapter${number}.xhtml`, xhtml(`Chapter ${number}`, `<h1>Chapter ${number}</h1>${Array.from({ length: 80 }, (_, index) => `<p>Bihon fixture passage ${number}.${index + 1}. This synthetic book verifies page rendering, navigation, and saved reading progress. The story follows a reader walking through a quiet garden beneath the morning sky.</p>`).join('')}`)]),
  ]);
}

module.exports = { makeEpub };
