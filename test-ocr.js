import { createWorker } from 'tesseract.js';
import fs from 'fs';

async function testOCR() {
  console.log("Starting OCR test...");
  
  // Erstelle Test-PNG
  const testFile = '/tmp/test-ocr.png';
  
  // Erstelle ein einfaches 100x100 weißes PNG
  const { createCanvas } = await import('canvas');
  const canvas = createCanvas(100, 100);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = 'black';
  ctx.font = '20px Arial';
  ctx.fillText('TEST', 10, 50);
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(testFile, buffer);
  
  console.log("Test image created:", testFile);
  
  // Teste OCR
  const worker = await createWorker("eng");
  console.log("Worker created");
  
  try {
    const result = await worker.recognize(testFile);
    console.log("OCR Result:", result.data.text);
  } catch (error) {
    console.error("OCR Error:", error.message);
  } finally {
    await worker.terminate();
  }
}

testOCR().catch(console.error);
