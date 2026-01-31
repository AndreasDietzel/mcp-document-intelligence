# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.2.0] - 2026-01-31

### Added
- **🔥 Full PDF OCR Support**: Complete solution for scanned PDFs
  - PDF.js (Mozilla, Apache-2.0) integration for rendering PDF pages to images
  - Automatic OCR fallback when text extraction yields <50 characters
  - Multi-page OCR support (up to 5 pages, 2x scale for better quality)
  - German language model (deu.traineddata) optimized for local documents
  - Quality metrics: `ocrUsed`, `ocrQuality`, `confidence` scores in results
  - Seamless integration: Works automatically without user configuration
- **Enhanced PDF Analysis**:
  - Smart text extraction: Tries pdf-parse first, falls back to OCR for scanned PDFs
  - Performance optimized: Reuses OCR worker, limits pages processed
  - Better error handling: Clear messages when PDFs are corrupted or unreadable

### Changed
- `analyze_document` now returns `ocrUsed: true` for scanned PDFs
- PDF processing time increased for scanned documents (30-60s expected)
- Better text extraction from image-based PDFs with no text layer

### Dependencies
- Added: `pdfjs-dist@5.4.530` (Apache-2.0 License, Mozilla Foundation)
- Added: `canvas` for Node.js image rendering
- Total: 44 new packages, 182 packages audited

## [4.1.0] - 2026-01-31

### Added
- **Comprehensive Test Suite**: 100 automated test cases covering all aspects
  - 20 Encoding & Character tests (UTF-8, Latin-1, special characters)
  - 15 Filename handling tests (special chars, long names, spaces)
  - 15 File content tests (empty, null-bytes, large files)
  - 15 Date & Metadata extraction tests
  - 15 Error handling & edge case tests
  - 10 Performance & scalability tests
  - 10 Security & data privacy tests
- **Enhanced File Validation**:
  - Maximum file size check (50MB)
  - Maximum filename length validation (255 chars)
  - File type validation with clear error messages
  - File existence and readability checks
- **Automatic Encoding Detection**:
  - UTF-8 primary detection
  - Latin-1/ISO-8859-1 fallback with automatic switching
  - Null-byte cleaning and reporting
  - Encoding information in analysis results
- **Performance Metrics**:
  - Total processing time tracking
  - Average time per file calculation
  - Files per second throughput reporting
  - Progress indicators for large batches
- **Improved Error Handling**:
  - Structured JSON error responses
  - Contextual error messages with suggestions
  - Graceful degradation for individual file failures
  - Batch processing continues despite errors

### Fixed
- Latin-1 encoded files now correctly detected and processed
- Null-bytes in files no longer corrupt text analysis
- Duplicate performance warnings removed
- File validation now happens before processing

### Changed
- Error responses now include detailed validation info
- Performance metrics included in batch processing results
- More informative error messages with actionable suggestions

### Performance
- 99% test success rate (99/100 tests passing)
- Average file processing: <100ms per file
- Batch processing: <2000ms for typical document sets
- Large file (10MB) processing: <500ms

### Security
- Path traversal prevention validated
- No sensitive data in logs confirmed
- Local-only processing verified
- GDPR compliance maintained

## [4.0.1] - 2026-01-26

### Added
- Initial release with batch processing
- Multi-format document support
- Recursive folder scanning
- Duplicate detection with SHA256
- Preview mode and backup/undo
- Metadata export (JSON/CSV)

