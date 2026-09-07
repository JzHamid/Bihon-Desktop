// Synthetic PNG fixture; no downloaded artwork is needed by local-library tests.
const zlib=require('node:zlib');
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc])}
function makePage(width=320,height=4000){const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;const pixels=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++){const row=y*(width*3+1);for(let x=0;x<width;x++){const offset=row+1+x*3;pixels[offset]=Math.floor(y/100)%2?220:100;pixels[offset+1]=Math.floor(x*255/width);pixels[offset+2]=180}}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))])}
module.exports={makePage};
