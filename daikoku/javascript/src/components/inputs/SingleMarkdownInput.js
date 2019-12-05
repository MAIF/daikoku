import React, { Component } from 'react';
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

import { AssetChooserByModal } from '../frontend/modals/AssetsChooserModal';
import { t, Translation } from "../../locales";

import hljs from 'highlight.js';

window.hljs = window.hljs || hljs;

export default class SingleMardownInput extends Component {
  state = {
    preview: false,
  };

  commands = [
    {
      name: t('Add header', this.props.currentLanguage),
      icon: 'heading',
      inject: (selected = ' ') => `# ${selected}`,
    },
    {
      name: t('Add bold text', this.props.currentLanguage),
      icon: 'bold',
      inject: (selected = ' ') => `**${selected}**`,
    },
    {
      name: t('Add italic text', this.props.currentLanguage),
      icon: 'italic',
      inject: (selected = ' ') => `*${selected}*`,
    },
    {
      name: t('Add strikethrough text', this.props.currentLanguage),
      icon: 'strikethrough',
      inject: (selected = ' ') => `~~${selected}~~`,
    },
    {
      name: t('Add link', this.props.currentLanguage),
      icon: 'link',
      inject: (selected = ' ') => `[${selected}](url)`,
    },
    {
      name: t('Add code', this.props.currentLanguage),
      icon: 'code',
      inject: (selected = ' ') => '```\n' + selected + '\n```\n',
      move: (pos, setPos) => setPos({ column: 0, row: pos.row - 2 }),
    },
    {
      name: t('Add quotes', this.props.currentLanguage),
      icon: 'quote-right',
      inject: (selected = ' ') => `> ${selected}`,
    },
    {
      name: t('Add image', this.props.currentLanguage),
      icon: 'image',
      inject: (selected = ' ') => `![${selected}](image-url)`,
    },
    {
      name: t('Add unordered list', this.props.currentLanguage),
      icon: 'list-ul',
      inject: (selected = ' ') => `* ${selected}`,
    },
    {
      name: t('Add ordered list', this.props.currentLanguage),
      icon: 'list-ol',
      inject: (selected = ' ') => `1. ${selected}`,
    },
    {
      name: t('Add check list', this.props.currentLanguage),
      icon: 'tasks',
      inject: (selected = ' ') => `* [ ] ${selected}`,
    },
    {
      name: t('Page ref', this.props.currentLanguage),
      icon: 'book',
      inject: (selected = ' ') => `@ref:[${selected}](team/api/doc)`,
    },
    {
      name: t('Warning', this.props.currentLanguage),
      icon: 'exclamation-triangle',
      inject: (selected = ' ') => `@@@ warning\n${selected}\n@@@\n`,
      move: (pos, setPos) => setPos({ column: 0, row: pos.row - 2 }),
    },
    {
      name: t('Warning with title', this.props.currentLanguage),
      icon: 'exclamation-circle',
      inject: (selected = ' ') => `@@@ warning { title='A nice title' }\n${selected}\n@@@\n`,
      move: (pos, setPos) => setPos({ column: 0, row: pos.row - 2 }),
    },
    {
      name: t('Note', this.props.currentLanguage),
      icon: 'sticky-note',
      inject: (selected = ' ') => `@@@ note\n${selected}\n@@@\n`,
      move: (pos, setPos) => setPos({ column: 0, row: pos.row - 2 }),
    },
    {
      name: t('Note with title', this.props.currentLanguage),
      icon: 'clipboard',
      inject: (selected = ' ') => `@@@ note { title='A nice title' }\n${selected}\n@@@\n`,
      move: (pos, setPos) => setPos({ column: 0, row: pos.row - 2 }),
    },
    {
      name: t('Lorem Ipsum', this.props.currentLanguage),
      icon: 'feather-alt',
      inject: () => 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus gravida convallis leo et aliquet. Aenean venenatis, elit et dignissim scelerisque, urna dui mollis nunc, id eleifend velit sem et ante. Quisque pharetra sed tellus id finibus. In quis porta libero. Nunc egestas eros elementum lacinia blandit. Donec nisi lacus, tristique vel blandit in, sodales eget lacus. Phasellus ultrices magna vel odio vestibulum, a rhoncus nunc ornare. Sed laoreet finibus arcu vitae aliquam. Aliquam quis ex dui.',
    },
    {
      name: t('Long Lorem Ipsum', this.props.currentLanguage),
      icon: 'feather',
      inject: () => `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus gravida convallis leo et aliquet. Aenean venenatis, elit et dignissim scelerisque, urna dui mollis nunc, id eleifend velit sem et ante. Quisque pharetra sed tellus id finibus. In quis porta libero. Nunc egestas eros elementum lacinia blandit. Donec nisi lacus, tristique vel blandit in, sodales eget lacus. Phasellus ultrices magna vel odio vestibulum, a rhoncus nunc ornare. Sed laoreet finibus arcu vitae aliquam. Aliquam quis ex dui.

Cras ut ultrices quam. Nulla eu purus sed turpis consequat sodales. Aenean vitae efficitur velit, vel accumsan felis. Curabitur aliquam odio dictum urna convallis faucibus. Vivamus eu dignissim lorem. Donec sed hendrerit massa. Suspendisse volutpat, nisi at fringilla consequat, eros lacus aliquam metus, eu convallis nulla mauris quis lacus. Aliquam ultricies, mi eget feugiat vestibulum, enim nunc eleifend nisi, nec tincidunt turpis elit id diam. Nunc placerat accumsan tincidunt. Nulla ut interdum dui. Praesent venenatis cursus aliquet. Nunc pretium rutrum felis nec pharetra.

Vivamus sapien ligula, hendrerit a libero vitae, convallis maximus massa. Praesent ante leo, fermentum vitae libero finibus, blandit porttitor risus. Nulla ac hendrerit turpis. Sed varius velit at libero feugiat luctus. Nunc rhoncus sem dolor, nec euismod justo rhoncus vitae. Vivamus finibus nulla a purus vestibulum sagittis. Maecenas maximus orci at est lobortis, nec facilisis erat rhoncus. Sed tempus leo et est dictum lobortis. Vestibulum rhoncus, nisl ut porta sollicitudin, arcu urna egestas arcu, eget efficitur neque ipsum ut felis. Ut commodo purus quis turpis tempus tincidunt. Donec id hendrerit eros. Vestibulum vitae justo consectetur, egestas nisi ac, eleifend odio.

Donec id mi cursus, volutpat dolor sed, bibendum sapien. Etiam vitae mauris sit amet urna semper tempus vel non metus. Integer sed ligula diam. Aenean molestie ultrices libero eget suscipit. Phasellus maximus euismod eros ut scelerisque. Ut quis tempus metus. Sed mollis volutpat velit eget pellentesque. Integer hendrerit ultricies massa eu tincidunt. Quisque at cursus augue. Sed diam odio, molestie sed dictum eget, efficitur nec nulla. Nullam vulputate posuere nunc nec laoreet. Integer varius sed erat vitae cursus. Vivamus auctor augue enim, a fringilla mauris molestie eget.

Proin vehicula ligula vel enim euismod, sed congue mi egestas. Nullam varius ut felis eu fringilla. Quisque sodales tortor nec justo tristique, sit amet consequat mi tincidunt. Suspendisse porttitor laoreet velit, non gravida nibh cursus at. Pellentesque faucibus, tellus in dapibus viverra, dolor mi dignissim tortor, id convallis ipsum lorem id nisl. Sed id nisi felis. Aliquam in ullamcorper ipsum, vel consequat magna. Donec nec mollis lacus, a euismod elit.`
    },
  ];

  onChange = e => {
    this.props.onChange(e);
  };

  showPreview = () => {
    window.$('pre code').each((i, block) => {
      window.hljs.highlightBlock(block);
    });
  };

  injectButtons = () => {
    return this.commands.map((command, idx) => {
      return (
        <button
          type="button"
          className="btn-for-descriptionToolbar"
          aria-label={command.name}
          title={command.name}
          key={`toolbar-btn-${idx}`}
          onClick={() => {
            const selection = this.editor.getSelection();
            if (selection) {
              this.editor.session.replace(
                selection.getRange(),
                command.inject(this.editor.getSelectedText())
              );
            } else {
              this.editor.session.insert(this.editor.getCursorPosition(), command.inject());
            }
            if (command.move) {
              command.move(this.editor.getCursorPosition(), p =>
                this.editor.moveCursorToPosition(p)
              );
            }
            this.editor.focus();
          }}>
          <i className={`fas fa-${command.icon}`} />
        </button>
      );
    });
  };

  render() {
    let code = this.props.value;
    const team = _.isFunction(this.props.team) ? this.props.team() : this.props.team;
    return (
      <div className="d-flex flex-column">
        <div
          style={{
            marginBottom: 10,
          }}
          className="d-flex flex-sm-row flex-column align-items-center"
        >
          <div>
            <div className="btn-group">
              <button
                type="button"
                className="btn btn-secondary"
                style={{ color: !this.state.preview ? '#7f96af' : 'white' }}
                onClick={() => this.setState({ preview: false })}>
                <Translation i18nkey="Write" language={this.props.currentLanguage}>
                  Write
                </Translation>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ color: this.state.preview ? '#7f96af' : 'white' }}
                onClick={() => this.setState({ preview: true }, () => this.showPreview())}>
                <Translation i18nkey="Preview" language={this.props.currentLanguage}>
                  Preview
                </Translation>
              </button>
            </div>
          </div>
          <div>
            {this.injectButtons()}
          </div>
          <div style={{ width: 250 }}>
            <AssetChooserByModal
              currentLanguage={this.props.currentLanguage}
              tenantMode={this.props.tenantMode}
              team={team}
              label={t("Set from asset", this.props.currentLanguage)}
              onSelect={asset => {
                this.editor.session.insert(this.editor.getCursorPosition(), asset.link);
                this.editor.focus();
              }}
            />
          </div>
        </div>
        {!this.state.preview && (
          <AceEditor
            ref={r => {
              if (r && r.editor) {
                this.editor = r.editor;
              }
            }}
            mode="markdown"
            theme="monokai"
            onChange={this.onChange}
            value={code}
            name="scriptParam"
            editorProps={{ $blockScrolling: true }}
            height={this.props.height || '300px'}
            width={this.props.width || '100%'}
            showGutter={true}
            tabSize={2}
            highlightActiveLine={true}
            enableBasicAutocompletion={true}
            enableLiveAutocompletion={true}
          />
        )}
        {this.state.preview && (
          <div
            className="api-description"
            dangerouslySetInnerHTML={{ __html: converter.makeHtml(code) }}
          />
        )}
      </div>
    );
  }
}