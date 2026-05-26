/**
 * shared/index.mjs — ESM bridge for CJS shared modules
 * Version: 1.0.0
 *
 * Bridges CJS shared modules into ESM so ESM consumers can use clean imports.
 *
 * Usage in ESM scripts:
 *   import { encodeToDataUri, downloadFile, loadConfig,
 *            loadCharacterConfig } from '../.github/muscles/shared/index.mjs';
 * @inheritance inheritable
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Data URI utilities
const dataUri = require('./data-uri.cjs');
export const { encodeToDataUri, downloadFile, decodeDataUri, mimeFromExt, MIME_MAP } = dataUri;

// Converter config + character config
const converterConfig = require('./converter-config.cjs');
export const { loadConfig, loadCharacterConfig, getPromptTemplate,
               findConfigFile, deepMerge, DEFAULTS } = converterConfig;

// Prompt preprocessing
const promptPreprocessor = require('./prompt-preprocessor.cjs');
export const { preprocessPrompt, validatePrompt, injectTraits,
               cleanPrompt, modelFamily, PROMPT_LIMITS } = promptPreprocessor;

// Markdown preprocessor
const markdownPreproc = require('./markdown-preprocessor.cjs');
export const { preprocessMarkdown, convertLatexMath, extractFrontmatter,
               validateHeadingHierarchy, embedLocalImages, validateLinks,
               LATEX_MATH_MAP, SUPERSCRIPT_MAP } = markdownPreproc;

// Mermaid pipeline
const mermaidPipeline = require('./mermaid-pipeline.cjs');
export const { findMermaidBlocks, injectPalette, validateSyntax,
               renderMermaid, convertSvgToPng, mermaidToTableFallback,
               createFlowchart, createSequence, createGantt,
               createTimeline, createMindmap, wrapInFence,
               FORMAT_SCALES, BRAND_PALETTE } = mermaidPipeline;

// SVG pipeline
const svgPipeline = require('./svg-pipeline.cjs');
export const { createSvg, createIcon, createDiagram, createBadge,
               validateSvg, svgToPng, writeSvg,
               BRAND_COLORS, THEME } = svgPipeline;
