import _ from 'lodash';
import showdown from 'showdown';

export function DaikokuExtension() {
  // @ref:[]()
  const refextension = {
    type: 'lang',
    regex: /@ref:\[(.*)\]\((.*)\)/g,
    replace: (expression, title, docId) => {
      const path = window.location.pathname;
      const rawParts = path.split('/');
      rawParts.shift();
      const parts = _.take(rawParts, 4);
      const teamId = parts[1];
      const apiId = parts[3];
      return `<a href="/${teamId}/${apiId}/documentation/${docId}">${title}</a>`;
    },
  };
  // @@@
  const tripleArobase = {
    type: 'lang',
    regex: /@@@/g,
    replace: () => {
      // console.log('@@@');
      return '</div>';
    },
  };
  // @@@ warning
  const warningExtension = {
    type: 'lang',
    regex: /@@@ warning/g,
    replace: () => {
      return '<div class="note note-warning">';
    },
  };
  // @@@ warning { title= }
  const warningTitleExtension = {
    type: 'lang',
    regex: /@@@ warning \{ title='(.*)' \}/g,
    replace: (expr, title) => {
      return `<div class="note note-warning"><div class="note-title">${title}</div>`;
    },
  };
  // @@@ note
  const noteExtension = {
    type: 'lang',
    regex: /@@@ note/g,
    replace: () => {
      return '<div class="note">';
    },
  };
  // @@@ note { title= }
  const noteTitleExtension = {
    type: 'lang',
    regex: /@@@ note \{ title='(.*)' \}/g,
    replace: (expr, title) => {
      return `<div class="note"><div class="note-title">${title}</div>`;
    },
  };
  return [
    refextension,
    warningTitleExtension,
    noteTitleExtension,
    warningExtension,
    noteExtension,
    tripleArobase,
  ];
}

export const converter = new showdown.Converter({
  omitExtraWLInCodeBlocks: true,
  ghCompatibleHeaderId: true,
  parseImgDimensions: true,
  simplifiedAutoLink: true,
  tables: true,
  tasklists: true,
  requireSpaceBeforeHeadingText: true,
  ghMentions: true,
  emoji: true,
  ghMentionsLink: '/{u}', // TODO: link to teams ?
  extensions: [DaikokuExtension],
});
