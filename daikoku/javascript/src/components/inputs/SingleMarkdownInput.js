import React, { useState, useEffect, useContext } from 'react';
import AceEditor from 'react-ace';
import _ from 'lodash';
import { converter } from '../../services/showdown';
import 'brace/mode/html';
import 'brace/mode/json';
import 'brace/mode/javascript';
import 'brace/mode/markdown';
import 'brace/theme/monokai';
import 'brace/ext/searchbox';
import 'brace/ext/language_tools';

import { Help } from './Help';
import { BeautifulTitle, Option } from '../utils';
import { AssetChooserByModal, MimeTypeFilter } from '../frontend';

import hljs from 'highlight.js';
import { I18nContext } from '../../core';

window.hljs = window.hljs || hljs;

const SingleMardownInput = (props) => {
  const [preview, setPreview] = useState(false);
  const [editor, setEditor] = useState(undefined);

  const { translateMethod, Translation } = useContext(I18nContext);

  useEffect(() => {
    if (preview) {
      showPreview();
    }
  }, [preview]);

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
  const commands = [
    {
      name: translateMethod('Add header'),
      icon: 'heading',
      inject: (selected = ' ') => `# ${selected}`,
    },
    {
      name: translateMethod('Add bold text'),
      icon: 'bold',
      inject: (selected = ' ') => `**${selected}**`,
    },
    {
      name: translateMethod('Add italic text'),
      icon: 'italic',
      inject: (selected = ' ') => `*${selected}*`,
    },
    {
      name: translateMethod('Add strikethrough text'),
      icon: 'strikethrough',
      inject: (selected = ' ') => `~~${selected}~~`,
    },
    {
      name: translateMethod('Add link'),
      icon: 'link',
      inject: (selected = ' ') => `[${selected}](url)`,
    },
    {
      name: translateMethod('Add code'),
      icon: 'code',
      inject: (selected = ' ') => '```\n' + selected + '\n```\n',
      move: (pos, setPos) => setPos({ column: 0, row: pos.row - 2 }),
    },
    {
      name: translateMethod('Add quotes'),
      icon: 'quote-right',
      inject: (selected = ' ') => `> ${selected}`,
    },
    {
      name: translateMethod('Add image'),
      icon: 'image',
      inject: (selected = ' ') => `![${selected}](image-url)`,
    },
    {
      name: translateMethod('Add unordered list'),
      icon: 'list-ul',
      inject: (selected = ' ') => `* ${selected}`,
    },
    {
      name: translateMethod('Add ordered list'),
      icon: 'list-ol',
      inject: (selected = ' ') => `1. ${selected}`,
    },
    {
      name: translateMethod('Add check list'),
      icon: 'tasks',
      inject: (selected = ' ') => `* [ ] ${selected}`,
    },
    {
      name: translateMethod('Page ref'),
      icon: 'book',
      inject: (selected = ' ') => `@ref:[${selected}](team/api/doc)`,
    },
    {
      name: translateMethod('Warning'),
      icon: 'exclamation-triangle',
      inject: (selected = ' ') => `@@@ warning\n${selected}\n@@@\n`,
      move: (pos, setPos) => setPos({ column: 0, row: pos.row - 2 }),
    },
    {
      name: translateMethod('Warning with title'),
      icon: 'exclamation-circle',
      inject: (selected = ' ') => `@@@ warning { title='A nice title' }\n${selected}\n@@@\n`,
      move: (pos, setPos) => setPos({ column: 0, row: pos.row - 2 }),
    },
    {
      name: translateMethod('Note'),
      icon: 'sticky-note',
      inject: (selected = ' ') => `@@@ note\n${selected}\n@@@\n`,
      move: (pos, setPos) => setPos({ column: 0, row: pos.row - 2 }),
    },
    {
      name: translateMethod('Note with title'),
      icon: 'clipboard',
      inject: (selected = ' ') => `@@@ note { title='A nice title' }\n${selected}\n@@@\n`,
      move: (pos, setPos) => setPos({ column: 0, row: pos.row - 2 }),
    },
    {
      name: translateMethod('Lorem Ipsum'),
      icon: 'feather-alt',
      inject: () =>
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus gravida convallis leo et aliquet. Aenean venenatis, elit et dignissim scelerisque, urna dui mollis nunc, id eleifend velit sem et ante. Quisque pharetra sed tellus id finibus. In quis porta libero. Nunc egestas eros elementum lacinia blandit. Donec nisi lacus, tristique vel blandit in, sodales eget lacus. Phasellus ultrices magna vel odio vestibulum, a rhoncus nunc ornare. Sed laoreet finibus arcu vitae aliquam. Aliquam quis ex dui.',
    },
    {
      name: translateMethod('Long Lorem Ipsum'),
      icon: 'feather',
      inject:
        () => `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus gravida convallis leo et aliquet. Aenean venenatis, elit et dignissim scelerisque, urna dui mollis nunc, id eleifend velit sem et ante. Quisque pharetra sed tellus id finibus. In quis porta libero. Nunc egestas eros elementum lacinia blandit. Donec nisi lacus, tristique vel blandit in, sodales eget lacus. Phasellus ultrices magna vel odio vestibulum, a rhoncus nunc ornare. Sed laoreet finibus arcu vitae aliquam. Aliquam quis ex dui.

Cras ut ultrices quam. Nulla eu purus sed turpis consequat sodales. Aenean vitae efficitur velit, vel accumsan felis. Curabitur aliquam odio dictum urna convallis faucibus. Vivamus eu dignissim lorem. Donec sed hendrerit massa. Suspendisse volutpat, nisi at fringilla consequat, eros lacus aliquam metus, eu convallis nulla mauris quis lacus. Aliquam ultricies, mi eget feugiat vestibulum, enim nunc eleifend nisi, nec tincidunt turpis elit id diam. Nunc placerat accumsan tincidunt. Nulla ut interdum dui. Praesent venenatis cursus aliquet. Nunc pretium rutrum felis nec pharetra.

Vivamus sapien ligula, hendrerit a libero vitae, convallis maximus massa. Praesent ante leo, fermentum vitae libero finibus, blandit porttitor risus. Nulla ac hendrerit turpis. Sed varius velit at libero feugiat luctus. Nunc rhoncus sem dolor, nec euismod justo rhoncus vitae. Vivamus finibus nulla a purus vestibulum sagittis. Maecenas maximus orci at est lobortis, nec facilisis erat rhoncus. Sed tempus leo et est dictum lobortis. Vestibulum rhoncus, nisl ut porta sollicitudin, arcu urna egestas arcu, eget efficitur neque ipsum ut felis. Ut commodo purus quis turpis tempus tincidunt. Donec id hendrerit eros. Vestibulum vitae justo consectetur, egestas nisi ac, eleifend odio.

Donec id mi cursus, volutpat dolor sed, bibendum sapien. Etiam vitae mauris sit amet urna semper tempus vel non metus. Integer sed ligula diam. Aenean molestie ultrices libero eget suscipit. Phasellus maximus euismod eros ut scelerisque. Ut quis tempus metus. Sed mollis volutpat velit eget pellentesque. Integer hendrerit ultricies massa eu tincidunt. Quisque at cursus augue. Sed diam odio, molestie sed dictum eget, efficitur nec nulla. Nullam vulputate posuere nunc nec laoreet. Integer varius sed erat vitae cursus. Vivamus auctor augue enim, a fringilla mauris molestie eget.

Proin vehicula ligula vel enim euismod, sed congue mi egestas. Nullam varius ut felis eu fringilla. Quisque sodales tortor nec justo tristique, sit amet consequat mi tincidunt. Suspendisse porttitor laoreet velit, non gravida nibh cursus at. Pellentesque faucibus, tellus in dapibus viverra, dolor mi dignissim tortor, id convallis ipsum lorem id nisl. Sed id nisi felis. Aliquam in ullamcorper ipsum, vel consequat magna. Donec nec mollis lacus, a euismod elit.`,
    },
    {
      name: translateMethod('Test asset'),
      component: (idx) => (
        <BeautifulTitle
          placement="bottom"
          title={translateMethod('image url from asset')}
          key={`toolbar-btn-${idx}`}>
          <AssetChooserByModal
            typeFilter={MimeTypeFilter.image}
            onlyPreview
            tenantMode={!props.team}
            team={props.team}
            teamId={Option(props.team)
              .map((t) => t._id)
              .getOrNull()}
            icon="fas fa-file-image"
            classNames="btn-for-descriptionToolbar"
            onSelect={(asset) =>
              editor.session.insert(editor.getCursorPosition(), origin + asset.link)
            }
          />
        </BeautifulTitle>
      ),
    },
  ];

  const showPreview = () => {
    window.$('pre code').each((i, block) => {
      window.hljs.highlightElement(block);
    });
  };

  const injectButtons = () => {
    return commands.map((command, idx) => {
      if (command.component) {
        return command.component(idx);
      }
      return (
        <button
          type="button"
          className="btn-for-descriptionToolbar"
          aria-label={command.name}
          title={command.name}
          key={`toolbar-btn-${idx}`}
          onClick={() => {
            const selection = editor.getSelection();
            if (selection) {
              editor.session.replace(
                selection.getRange(),
                command.inject(editor.getSelectedText())
              );
            } else {
              editor.session.insert(editor.getCursorPosition(), command.inject());
            }
            if (command.move) {
              command.move(editor.getCursorPosition(), (p) => editor.moveCursorToPosition(p));
            }
            editor.focus();
          }}>
          <i className={`fas fa-${command.icon}`} />
        </button>
      );
    });
  };

  let code = props.value;
  const team = _.isFunction(props.team) ? props.team() : props.team;

  return (
    <div className="form-group row">
      {props.label && (
        <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
          <Help place="right" text={props.help} label={props.label} />
        </label>
      )}
      <div className={props.fullWidth ? 'col-sm-12' : 'col-sm-10'}>
        <div>
          <div className="btn-group">
            <button
              type="button"
              className="btn btn-secondary"
              style={{ color: !preview ? '#7f96af' : 'white' }}
              onClick={() => setPreview(false)}>
              <Translation i18nkey="Write">Write</Translation>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ color: preview ? '#7f96af' : 'white' }}
              onClick={() => setPreview(true)}>
              <Translation i18nkey="Preview">Preview</Translation>
            </button>
          </div>
        </div>
        <div className="d-flex flex-row mt-1 mb-2">{injectButtons()}</div>
        <div style={{ width: props.fixedWitdh || 250 }}>
          {props.assertChooserActive && (
            <AssetChooserByModal
              tenantMode={props.tenantMode}
              team={team}
              label={translateMethod('Set from asset')}
              onSelect={(asset) => {
                editor.session.insert(editor.getCursorPosition(), asset.link);
                editor.focus();
              }}
            />
          )}
        </div>
        {!preview && (
          <AceEditor
            ref={(r) => {
              if (r && r.editor) {
                setEditor(r.editor);
              }
            }}
            mode="markdown"
            theme="monokai"
            onChange={props.onChange}
            value={code}
            name="scriptParam"
            editorProps={{ $blockScrolling: true }}
            height={props.height || '300px'}
            width={props.width || '100%'}
            showGutter={true}
            tabSize={2}
            highlightActiveLine={true}
            enableBasicAutocompletion={true}
            enableLiveAutocompletion={true}
          />
        )}
        {preview && (
          <div
            className="api-description"
            dangerouslySetInnerHTML={{ __html: converter.makeHtml(code) }}
          />
        )}
      </div>
    </div>
  );
};

export default SingleMardownInput;
