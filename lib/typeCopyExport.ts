export interface TypeCopyExportMetadata {
  fileName: string;
  documentId: string;
  approvedAt: string;
}

const encoder = new TextEncoder();
const crcTable = createCrcTable();

export function buildTypeCopyDocx(text: string, metadata: TypeCopyExportMetadata): Uint8Array {
  const files = [
    {
      path: "[Content_Types].xml",
      content: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`),
    },
    {
      path: "_rels/.rels",
      content: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`),
    },
    {
      path: "word/document.xml",
      content: encoder.encode(wordDocumentXml(text, metadata)),
    },
  ];

  return zip(files);
}

export function buildTypeCopyPdf(text: string, metadata: TypeCopyExportMetadata): Uint8Array {
  const lines = wrapLines(
    [
      `NyaySetu Type Copy - ${metadata.fileName}`,
      `Document ID: ${metadata.documentId}`,
      `Approved: ${metadata.approvedAt}`,
      "",
      ...text.split(/\r?\n/),
    ],
    88,
  );
  const linesPerPage = 54;
  const pageLines = chunkLines(lines, linesPerPage);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  ];
  const pageObjectNumbers: number[] = [];

  for (const page of pageLines) {
    const pageObjectNumber = objects.length + 1;
    const contentObjectNumber = pageObjectNumber + 1;
    const content = pdfContent(page);

    pageObjectNumbers.push(pageObjectNumber);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
      `<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
  }

  objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((pageObjectNumber) => `${pageObjectNumber} 0 R`).join(" ")}] /Count ${pageObjectNumbers.length} >>`;

  return encoder.encode(pdf(objects));
}

function wordDocumentXml(text: string, metadata: TypeCopyExportMetadata) {
  const paragraphs = [
    `NyaySetu Type Copy - ${metadata.fileName}`,
    `Document ID: ${metadata.documentId}`,
    `Approved: ${metadata.approvedAt}`,
    "",
    ...text.split(/\r?\n/),
  ];

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function zip(files: Array<{ path: string; content: Uint8Array }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path);
    const crc = crc32(file.content);
    const localHeader = join([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.content.length),
      u32(file.content.length),
      u16(name.length),
      u16(0),
      name,
    ]);
    const centralHeader = join([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.content.length),
      u32(file.content.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);

    localParts.push(localHeader, file.content);
    centralParts.push(centralHeader);
    offset += localHeader.length + file.content.length;
  }

  const centralDirectory = join(centralParts);
  const end = join([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);

  return join([...localParts, centralDirectory, end]);
}

function pdfContent(lines: string[]) {
  const commands = ["BT", "/F1 10 Tf", "50 744 Td"];

  lines.forEach((line, index) => {
    if (index > 0) commands.push("0 -13 Td");
    commands.push(`(${escapePdf(line)}) Tj`);
  });

  commands.push("ET");
  return commands.join("\n");
}

function pdf(objects: string[]) {
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((object, index) => {
    offsets.push(byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return body;
}

function wrapLines(lines: string[], width: number) {
  return lines.flatMap((line) => {
    if (line.length <= width) return [line];
    const chunks: string[] = [];
    let remaining = line;

    while (remaining.length > width) {
      const breakAt = Math.max(remaining.lastIndexOf(" ", width), 1);
      chunks.push(remaining.slice(0, breakAt).trimEnd());
      remaining = remaining.slice(breakAt).trimStart();
    }

    chunks.push(remaining);
    return chunks;
  });
}

function chunkLines(lines: string[], linesPerPage: number) {
  const chunks: string[][] = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    chunks.push(lines.slice(index, index + linesPerPage));
  }

  return chunks.length ? chunks : [[""]];
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapePdf(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
}

function join(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function u16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function byteLength(value: string) {
  return encoder.encode(value).length;
}
