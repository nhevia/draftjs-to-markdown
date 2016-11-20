/* @flow */

import { ContentState } from 'draft-js';
import { isEmptyString, forEach, isList } from './common';

/**
* Mapping block-type to corresponding markdown symbol.
*/
const blockTypesMapping: Object = {
  unstyled: '',
  'header-one': '# ',
  'header-two': '## ',
  'header-three': '### ',
  'header-four': '#### ',
  'header-five': '##### ',
  'header-six': '###### ',
  'unordered-list-item': '- ',
  'ordered-list-item': '1. ',
  blockquote: '> ',
};

/**
* Function will return markdown symbol for a block.
*/
export function getBlockTagSymbol(block: Object): string {
  return block.type && blockTypesMapping[block.type];
}

/**
* Function to check if the block is an atomic entity block.
*/
function isAtomicBlock(block: Object): boolean {
  if (block.entityRanges.length > 0 && isEmptyString(block.text)) {
    return true;
  }
  return false;
}

/**
* Function will return markdown for Entity.
*/
function getEntityMarkdown(entityMap: Object, entityKey: number, text: string): string {
  const entity = entityMap[entityKey];
  if (entity.type === 'LINK' || entity.type === 'MENTION') {
    return `[${text}](${entity.data.url})`;
  }
  if (entity.type === 'IMAGE') {
    return `!(${entity.data.src})`;
  }
  return text;
}

/**
* The function returns an array of entity sections in blocks.
* These will be areas in block which have same entity or no entity applicable to them.
*/
function getEntitySections(entityRanges: Object, blockLength: number): Array<Object> {
  const sections = [];
  let lastOffset = 0;
  entityRanges.forEach((r) => {
    if (r.offset > lastOffset) {
      sections.push({
        start: lastOffset,
        end: r.offset - 1,
      });
    }
    sections.push({
      start: r.offset,
      end: r.offset + r.length,
      entityKey: r.key,
    });
    lastOffset = r.offset + r.length;
  });
  if (lastOffset < blockLength) {
    sections.push({
      start: lastOffset,
      end: blockLength,
    });
  }
  return sections;
}

/**
* The function will return array of inline styles applicable to the block.
*/
function getStyleArrayForBlock(block: Object): Object {
  const { text, inlineStyleRanges } = block;
  const inlineStyles = {
    COLOR: new Array(text.length),
    BGCOLOR: new Array(text.length),
    FONTSIZE: new Array(text.length),
    FONTFAMILY: new Array(text.length),
    SUBSCRIPT: new Array(text.length),
    SUPERSCRIPT: new Array(text.length),
    CODE: new Array(text.length),
    STRIKETHROUGH: new Array(text.length),
    UNDERLINE: new Array(text.length),
    ITALIC: new Array(text.length),
    BOLD: new Array(text.length),
    length: text.length,
  };
  if (inlineStyleRanges && inlineStyleRanges.length > 0) {
    inlineStyleRanges.forEach((range) => {
      const offset = range.offset;
      const length = offset + range.length;
      for (let i = offset; i < length; i += 1) {
        if (range.style.startsWith('color-')) {
          inlineStyles.COLOR[i] = range.style.substring(6);
        } else if (range.style.startsWith('bgcolor-')) {
          inlineStyles.BGCOLOR[i] = range.style.substring(8);
        } else if (range.style.startsWith('fontsize-')) {
          inlineStyles.FONTSIZE[i] = range.style.substring(9);
        } else if (range.style.startsWith('fontfamily-')) {
          inlineStyles.FONTFAMILY[i] = range.style.substring(11);
        } else if (inlineStyles[range.style]) {
          inlineStyles[range.style][i] = true;
        }
      }
    });
  }
  return inlineStyles;
}

/**
* Function returns true for a set of styles if the value of these styles at an offset
* are same as that on the previous offset.
*/
export function sameStyleAsPrevious(
  inlineStyles: Object,
  styles: Array<string>,
  index: number
): boolean {
  let sameStyled = true;
  if (index > 0 && index < inlineStyles.length) {
    styles.forEach((style) => {
      sameStyled = sameStyled && inlineStyles[style][index] === inlineStyles[style][index - 1];
    });
  } else {
    sameStyled = false;
  }
  return sameStyled;
}

/**
* The function will return inline style applicable at some offset within a block.
*/
export function getStylesAtOffset(inlineStyles: Object, offset: number): Object {
  const styles = {};
  if (inlineStyles.COLOR[offset]) {
    styles.COLOR = inlineStyles.COLOR[offset];
  }
  if (inlineStyles.BGCOLOR[offset]) {
    styles.BGCOLOR = inlineStyles.BGCOLOR[offset];
  }
  if (inlineStyles.FONTSIZE[offset]) {
    styles.FONTSIZE = inlineStyles.FONTSIZE[offset];
  }
  if (inlineStyles.FONTFAMILY[offset]) {
    styles.FONTFAMILY = inlineStyles.FONTFAMILY[offset];
  }
  if (inlineStyles.SUBSCRIPT[offset]) {
    styles.SUBSCRIPT = true;
  }
  if (inlineStyles.SUPERSCRIPT[offset]) {
    styles.SUPERSCRIPT = true;
  }
  if (inlineStyles.CODE[offset]) {
    styles.CODE = true;
  }
  if (inlineStyles.STRIKETHROUGH[offset]) {
    styles.STRIKETHROUGH = true;
  }
  if (inlineStyles.UNDERLINE[offset]) {
    styles.UNDERLINE = true;
  }
  if (inlineStyles.ITALIC[offset]) {
    styles.ITALIC = true;
  }
  if (inlineStyles.BOLD[offset]) {
    styles.BOLD = true;
  }
  return styles;
}

/**
* For a given section in a block the function will return a further list of sections,
* with similar inline styles applicable to them.
*/
function getStyleSections(
  block: Object,
  styles: Array<string>,
  start: number,
  end: number
): Array<Object> {
  const styleSections = [];
  const { text } = block;
  if (text.length > 0) {
    const inlineStyles = getStyleArrayForBlock(block);
    let section;
    for (let i = start; i < end; i += 1) {
      if (i !== start && sameStyleAsPrevious(inlineStyles, styles, i)) {
        section.text.push(text[i]);
        section.end = i + 1;
      } else {
        section = {
          styles: getStylesAtOffset(inlineStyles, i),
          text: [text[i]],
          start: i,
          end: i + 1,
        };
        styleSections.push(section);
      }
    }
  }
  return styleSections;
}

/**
* The function returns text for given section of block after doing required character replacements.
*/
function getSectionText(text: Array<string>): string {
  if (text && text.length > 0) {
    const chars = text.map((ch) => {
      switch (ch) {
        case '\n':
          return '\\s\\s\n';
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        default:
          return ch;
      }
    });
    return chars.join('');
  }
  return '';
}

/**
* Function returns markdown for inline style symbols.
*/
export function addInlineStyleMarkup(style: string, content: string): string {
  if (style === 'BOLD') {
    return `**${content}**`;
  } else if (style === 'ITALIC') {
    return `*${content}*`;
  } else if (style === 'UNDERLINE') {
    return `__${content}__`;
  } else if (style === 'STRIKETHROUGH') {
    return `~~${content}~~`;
  } else if (style === 'CODE') {
    return `\`${content}\``;
  } else if (style === 'SUPERSCRIPT') {
    return `<sup>${content}</sup>`;
  } else if (style === 'SUBSCRIPT') {
    return `<sub>${content}</sub>`;
  }
  return content;
}

/**
* The method returns markup for section to which inline styles
* BOLD, UNDERLINE, ITALIC, STRIKETHROUGH, CODE, SUPERSCRIPT, SUBSCRIPT are applicable.
*/
function getStyleTagSectionMarkdown(styles: Object, text: string): string {
  let content = text;
  forEach(styles, (style, value) => {
    content = addInlineStyleMarkup(style, content, value);
  });
  return content;
}

/**
* Function returns html for text applying inline style in styles property in a span.
*/
export function addStylePropertyMarkdown(styleSection: Object): string {
  const { styles, text } = styleSection;
  const content = getSectionText(text);
  if (styles && (styles.COLOR || styles.BGCOLOR || styles.FONTSIZE || styles.FONTFAMILY)) {
    let styleString = 'style="';
    if (styles.COLOR) {
      styleString += `color: ${styles.COLOR};`;
    }
    if (styles.BGCOLOR) {
      styleString += `background-color: ${styles.BGCOLOR};`;
    }
    if (styles.FONTSIZE) {
      styleString += `font-size: ${styles.FONTSIZE};`;
    }
    if (styles.FONTFAMILY) {
      styleString += `font-family: ${styles.FONTFAMILY};`;
    }
    styleString += '"';
    return `<span ${styleString}>${content}</span>`;
  }
  return content;
}

/**
* The method returns markdown for an entity section.
* An entity section is a continuous section in a block
* to which same entity or no entity is applicable.
*/
function getEntitySectionMarkdown(block: Object, entityMap: Object, entitySection: Object): string {
  const entitySectionMarkdown = [];
  const styleSections = getStyleSections(
    block,
    ['BOLD', 'ITALIC', 'UNDERLINE', 'STRIKETHROUGH', 'CODE', 'SUPERSCRIPT', 'SUBSCRIPT'],
    entitySection.start,
    entitySection.end
  );
  let styleSectionText = '';
  styleSections.forEach((styleSection) => {
    const stylePropertySections = getStyleSections(
      block,
      ['COLOR', 'BGCOLOR', 'FONTSIZE', 'FONTFAMILY'],
      styleSection.start,
      styleSection.end
    );
    let stylePropertySectionText = '';
    stylePropertySections.forEach((stylePropertySection) => {
      stylePropertySectionText += addStylePropertyMarkdown(stylePropertySection);
    });
    styleSectionText += getStyleTagSectionMarkdown(styleSection.styles, stylePropertySectionText);
  });
  entitySectionMarkdown.push(styleSectionText);
  let sectionText = entitySectionMarkdown.join('');
  if (entitySection.entityKey !== undefined && entitySection.entityKey !== null) {
    sectionText = getEntityMarkdown(entityMap, entitySection.entityKey, sectionText);
  }
  return sectionText;
}

/**
* Replace leading blank spaces by &nbsp;
*/
export function trimLeadingZeros(sectionText: string): string {
  if (sectionText) {
    let replacedText = sectionText;
    for (let i = 0; i < replacedText.length; i += 1) {
      if (sectionText[i] === ' ') {
        replacedText = replacedText.replace(' ', '&nbsp;');
      } else {
        break;
      }
    }
    return replacedText;
  }
  return sectionText;
}

/**
* Replace trailing blank spaces by &nbsp;
*/
export function trimTrailingZeros(sectionText: string): string {
  if (sectionText) {
    let replacedText = sectionText;
    for (let i = replacedText.length - 1; i >= 0; i -= 1) {
      if (replacedText[i] === ' ') {
        replacedText = `${replacedText.substring(0, i)}&nbsp;${replacedText.substring(i + 1)}`;
      } else {
        break;
      }
    }
    return replacedText;
  }
  return sectionText;
}

/**
* Function will return the markdown for block content.
*/
export function getBlockContentMarkdown(block: Object, entityMap: Object): string {
  if (isAtomicBlock(block)) {
    return getEntityMarkdown(entityMap, block.entityRanges[0].key);
  }
  const blockMarkdown = [];
  const entitySections = getEntitySections(block.entityRanges, block.text.length);
  entitySections.forEach((section, index) => {
    let sectionText = getEntitySectionMarkdown(block, entityMap, section);
    if (index === 0) {
      sectionText = trimLeadingZeros(sectionText);
    }
    if (index === entitySections.length - 1) {
      sectionText = trimTrailingZeros(sectionText);
    }
    blockMarkdown.push(sectionText);
  });
  return blockMarkdown.join('');
}

/**
* Function will return style string for a block.
*/
export function getBlockStyle(data: Object): string {
  let styles = '';
  forEach(data, (key, value) => {
    styles += `${key}:${value};`;
  });
  return styles;
}

/**
* FUnciton will add <span> with style property aroung block content for block level text-styling.
*/
function getBlockStyleProperty(blockData: Object, content: string) {
  const blockStyle = getBlockStyle(blockData);
  if (blockStyle) {
    return `<span style="${blockStyle}">${content}</span>`;
  }
  return content;
}

/**
* Function will return markdown for the block.
*/
function getBlockMarkdown(block: Object, entityMap: Object): string {
  const blockMarkdown = [];
  blockMarkdown.push(getBlockTagSymbol(block));
  let blockContentMarkdown = getBlockContentMarkdown(block, entityMap);
  if (block.data) {
    blockContentMarkdown = getBlockStyleProperty(block.data, blockContentMarkdown);
  }
  blockMarkdown.push(blockContentMarkdown);
  blockMarkdown.push('\n');
  return blockMarkdown.join('');
}

function getDepthPadding(depth: number) {
  let padding = '';
  for (let i = 0; i < depth * 4; i += 1) {
    padding += ' ';
  }
  return padding;
}

/**
* The function will generate markdown for given draftjs editorContent.
*/
export default function draftToMarkdown(editorContent: ContentState): string {
  const markdown = [];
  if (editorContent) {
    const { blocks, entityMap } = editorContent;
    if (blocks && blocks.length > 0) {
      blocks.forEach((block) => {
        let content = getBlockMarkdown(block, entityMap);
        if (isList(block.type)) {
          content = getDepthPadding(block.depth) + content;
        }
        markdown.push(content);
      });
    }
  }
  return markdown.join('');
}