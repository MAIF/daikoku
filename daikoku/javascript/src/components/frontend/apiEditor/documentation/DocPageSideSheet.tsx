import { constraints, Flow, Form, format, FormRef, Schema, type } from '@maif/react-forms';
import { Feather, FileImage } from 'lucide-react';
import { useContext, useRef, useState } from 'react';

import { I18nContext, ModalContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import { AssetChooserByModal, MimeTypeFilter } from '../../../../contexts/modals/AssetsChooserModal';
import * as Services from '../../../../services';
import { ICmsPageGQL, IDocPage, ITeamSimple } from '../../../../types';
import { longLoremIpsum, loremIpsum } from '../../../backoffice/apis/TeamApiDocumentation';
import { ChoiceChips } from '../../../inputs';
import { SideSheet, SideSheetActions } from '../../../utils';

type DocSource = 'inline' | 'remote' | 'cms';

type DocPageFormValue = IDocPage & {
  source: DocSource;
  format: string;
};

type DocPageSideSheetProps = {
  ownerTeam: ITeamSimple;
  page: IDocPage;
  creation: boolean;
  onSave: (page: IDocPage) => Promise<unknown>;
  onClose: () => void;
};

const INLINE_FORMATS = [
  { value: 'text/markdown', label: 'Markdown' },
  { value: 'text/asciidoc', label: 'AsciiDoc' },
  { value: 'text/html', label: 'HTML' },
];

const REMOTE_TYPES = [
  { value: 'text/markdown', label: 'Markdown (.md)' },
  { value: 'text/asciidoc', label: 'AsciiDoc (.adoc)' },
  { value: 'text/html', label: 'HTML (.html)' },
  { value: 'application/pdf', label: 'PDF (.pdf)' },
  { value: 'image/png', label: 'PNG (.png)' },
  { value: 'image/jpeg', label: 'JPEG (.jpg)' },
  { value: 'image/gif', label: 'GIF (.gif)' },
  { value: 'video/webm', label: 'WebM (.webm)' },
  { value: 'video/mpeg', label: 'MPEG (.mpeg)' },
  { value: 'video/x-msvideo', label: 'AVI (.avi)' },
  { value: 'application/vnd.oasis.opendocument.text', label: 'OpenDocument text (.odt)' },
  { value: 'application/vnd.oasis.opendocument.spreadsheet', label: 'OpenDocument spreadsheet (.ods)' },
  { value: 'application/vnd.oasis.opendocument.presentation', label: 'OpenDocument presentation (.odp)' },
];

const FLOW: Flow = [
  'title',
  'source',
  'format',
  'content',
  'contentType',
  'remoteContentUrl',
  'remoteContentHeaders',
  'cmsPage',
];

const sourceOf = (page: IDocPage): DocSource => {
  if (page.contentType === 'cms/page') {
    return 'cms';
  } else if (page.remoteContentEnabled) {
    return 'remote';
  } else {
    return 'inline';
  }
};

const toFormValue = (page: IDocPage): DocPageFormValue => {
  const inlineFormat = INLINE_FORMATS.some((f) => f.value === page.contentType);

  return {
    ...page,
    source: sourceOf(page),
    format: inlineFormat ? page.contentType : INLINE_FORMATS[0].value,
  };
};

const toPage = ({ source, format, ...page }: DocPageFormValue): IDocPage => {
  if (source === 'cms') {
    return {
      ...page,
      contentType: 'cms/page',
      remoteContentEnabled: false,
    };
  } else if (source === 'remote') {
    return {
      ...page,
      remoteContentEnabled: true,
      cmsPage: undefined,
    };
  } else {
    return {
      ...page,
      contentType: format,
      remoteContentEnabled: false,
      cmsPage: undefined,
    };
  }
};

export const DocPageSideSheet = (props: DocPageSideSheetProps) => {
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const { customGraphQLClient } = useContext(GlobalContext);

  const formRef = useRef<FormRef | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const getCmsPages = () =>
    customGraphQLClient
      .request<{ pages: Array<ICmsPageGQL> }>(Services.graphql.cmsPages)
      .then(({ pages }) => pages.filter((page) => page.path.includes('documentations/')));

  const schema: Schema = {
    title: {
      type: type.string,
      label: translate('doc.page.form.title'),
      constraints: [constraints.required(translate('constraints.required.name'))],
    },
    source: {
      type: type.string,
      label: null,
      render: ({ value, onChange }) => (
        <ChoiceChips<DocSource>
          label={translate('doc.page.form.source')}
          options={[
            { value: 'inline', label: translate('doc.page.form.source.inline') },
            { value: 'remote', label: translate('doc.page.form.source.remote') },
            { value: 'cms', label: translate('doc.page.form.source.cms') },
          ]}
          value={value}
          onChange={(source) => onChange?.(source)}
        />
      ),
    },
    format: {
      type: type.string,
      format: format.buttonsSelect,
      label: translate('doc.page.form.format'),
      options: INLINE_FORMATS,
      visible: ({ rawValues }) => rawValues.source === 'inline',
      deps: ['source'],
    },
    content: {
      type: type.string,
      format: format.markdown,
      label: translate('doc.page.form.content'),
      visible: ({ rawValues }) => rawValues.source === 'inline',
      deps: ['source'],
      props: {
        height: '480px',
        actions: (insert) => (
          <>
            <button
              type="button"
              className="btn-for-descriptionToolbar"
              aria-label={translate('Lorem Ipsum')}
              title={translate('Lorem Ipsum')}
              onClick={() => insert(loremIpsum)}
            >
              <Feather />
            </button>
            <button
              type="button"
              className="btn-for-descriptionToolbar"
              aria-label={translate('Long Lorem Ipsum')}
              title={translate('Long Lorem Ipsum')}
              onClick={() => insert(longLoremIpsum)}
            >
              <Feather />
            </button>
            <AssetChooserByModal
              typeFilter={MimeTypeFilter.image}
              onlyPreview
              tenantMode={false}
              team={props.ownerTeam}
              icon={<FileImage />}
              classNames="btn-for-descriptionToolbar"
              onSelect={(asset) => insert(asset.link)}
              label={translate('Insert URL')}
            />
          </>
        ),
      },
    },
    contentType: {
      type: type.string,
      format: format.select,
      label: translate('doc.page.form.type'),
      options: REMOTE_TYPES,
      visible: ({ rawValues }) => rawValues.source === 'remote',
      deps: ['source'],
    },
    remoteContentUrl: {
      type: type.string,
      label: translate('doc.page.form.url'),
      visible: ({ rawValues }) => rawValues.source === 'remote',
      deps: ['source'],
      render: ({ value, onChange, setValue }) => (
        <div className="d-flex align-items-center gap-2">
          <input
            className="mrf-input flex-grow-1"
            placeholder="https://"
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
          />
          <AssetChooserByModal
            team={props.ownerTeam}
            label={translate('doc.page.form.asset')}
            onSelect={(asset) => {
              setValue?.('remoteContentUrl', asset.link);
              setValue?.('contentType', asset.contentType);
            }}
          />
        </div>
      ),
    },
    remoteContentHeaders: {
      type: type.object,
      label: translate('doc.page.form.headers'),
      visible: ({ rawValues }) => rawValues.source === 'remote',
      deps: ['source'],
    },
    cmsPage: {
      type: type.string,
      format: format.select,
      label: translate('doc.page.form.cms'),
      props: { isClearable: true },
      visible: ({ rawValues }) => rawValues.source === 'cms',
      deps: ['source'],
      optionsFrom: getCmsPages,
      transformer: (page: ICmsPageGQL) => ({
        label: `${page.path}/${page.name}`,
        value: page.id,
      }),
    },
  };

  const submit = (value: DocPageFormValue) => {
    const page = toPage(value);

    const confirmation = props.page.linked
      ? confirm({ message: translate('doc.page.linked.confirm') })
      : Promise.resolve(true);

    confirmation.then((ok) => {
      if (ok) {
        setSaving(true);
        props.onSave(page).finally(() => setSaving(false));
      }
    });
  };

  return (
    <SideSheet
      title={translate(props.creation ? 'doc.page.create.modal.title' : 'doc.page.update.modal.title')}
      size="wide"
      onClose={props.onClose}
      isDirty={() => !!formRef.current?.methods.formState.isDirty}
      footer={(requestClose) => (
        <SideSheetActions
          onCancel={requestClose}
          onSave={() => formRef.current?.handleSubmit()}
          saveDisabled={saving}
        />
      )}
    >
      <Form
        ref={formRef}
        schema={schema}
        flow={FLOW}
        value={toFormValue(props.page)}
        onSubmit={submit}
        footer={() => <></>}
      />
    </SideSheet>
  );
};
