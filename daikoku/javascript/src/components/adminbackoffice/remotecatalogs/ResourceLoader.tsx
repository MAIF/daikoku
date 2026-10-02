import { CodeInput } from '@maif/react-forms';
import { useMutation } from '@tanstack/react-query';
import classNames from 'classnames';
import { Check, ExternalLink } from 'lucide-react';
import { DragEvent, useContext, useState } from 'react';

import { I18nContext, ModalContext } from '../../../contexts';
import * as Services from '../../../services';
import { ITenantFull } from '../../../types';
import { Can, manage, tenant as TENANT } from '../../utils';
import { CatalogRun } from './CatalogRuns';

const FILES_DOC_URL =
  'https://maif.github.io/daikoku/docs/usages/tenantusage/remote-catalogs/files';

const CATALOG_EXTENSIONS = ['.json', '.yaml', '.yml'];

const EDITOR_STYLE = {
  height: '100%',
  minHeight: '300px',
  maxHeight: '-1',
  width: '-1',
  minWidth: '-1',
  maxWidth: '-1',
};

type LoadRequest = { content: string; dryRun: boolean };

const useLoadResources = (tenantId: string) =>
  useMutation({
    mutationFn: ({ content, dryRun }: LoadRequest): Promise<CatalogRun> =>
      Services.loadResources(tenantId, [{ path: 'resources.yaml', content }], dryRun),
  });

const EditorPlaceholder = () => {
  const { translate } = useContext(I18nContext);

  return <div className="editor-placeholder">{translate('resource-loader.placeholder')}</div>;
};

const LoadResult = (props: { run: CatalogRun; dryRun: boolean }) => {
  const { translate } = useContext(I18nContext);

  const count = props.run.created.length;
  const messageKey = props.dryRun
    ? 'resource-loader.result.valid'
    : 'resource-loader.result.created';

  if (props.run.errors.length > 0) {
    return (
      <div className="text-danger small">
        {props.run.errors.map((error, i) => (
          <div key={i}>{error}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="d-flex align-items-center gap-1">
      <Check size={16} />
      {translate({ key: messageKey, plural: count > 1, replacements: [String(count)] })}
    </div>
  );
};

export const ResourceLoader = (props: { tenant: ITenantFull }) => {
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);

  const [content, setContent] = useState('');
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  const load = useLoadResources(props.tenant._id);

  const lastWasCheck = load.variables?.dryRun === true;
  const checkPassed =
    lastWasCheck &&
    load.variables?.content === content &&
    load.data?.status === 'completed';
  const isEmpty = content.trim() === '';
  const canCheck = !isEmpty && !load.isPending;
  const canImport = checkPassed && !load.isPending;
  const dropZoneClass = classNames('drop-zone position-relative flex-grow-1', {
    '--active': isDraggingFiles,
  });

  const check = () => load.mutate({ content, dryRun: true });
  const entitiesToCreate = load.data?.created.length ?? 0;

  const importResources = () =>
    confirm({
      title: translate('resource-loader.import'),
      message: translate({
        key: 'resource-loader.import.confirm',
        plural: entitiesToCreate > 1,
        replacements: [String(entitiesToCreate)],
      }),
      okLabel: translate('resource-loader.import'),
    }).then((ok) => {
      if (ok) {
        load.mutate({ content, dryRun: false });
      }
    });

  const dropFiles = (event: DragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer.files);
    const catalogFiles = files.filter((file) =>
      CATALOG_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))
    );

    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFiles(false);

    if (catalogFiles.length === 0) {
      return;
    }

    Promise.all(catalogFiles.map((file) => file.text())).then((texts) => {
      const dropped = texts.join('\n---\n');

      setContent(dropped);
      load.mutate({ content: dropped, dryRun: true });
    });
  };

  const showDropTarget = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('Files')) {
      setIsDraggingFiles(true);
    }
  };

  const hideDropTarget = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDraggingFiles(false);
    }
  };

  return (
    <Can I={manage} a={TENANT} dispatchError>
      <div className="p-3 d-flex flex-column flex-grow-1">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <p className="text-muted mb-0">{translate('resource-loader.description')}</p>
          <a
            className="external-link"
            href={FILES_DOC_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {translate('Documentation')}
            <ExternalLink size={14} />
          </a>
        </div>
        <div
          className={dropZoneClass}
          style={{ minHeight: '300px' }}
          onDragEnter={showDropTarget}
          onDragLeave={hideDropTarget}
          onDropCapture={dropFiles}
        >
          <CodeInput
            className="position-absolute top-0 start-0 w-100 h-100"
            themeStyle={EDITOR_STYLE}
            value={content}
            onChange={setContent}
          />
          {isEmpty && <EditorPlaceholder />}
        </div>
        <div className="sticky-actions d-flex align-items-start gap-3">
          <div className="sticky-actions__result flex-grow-1">
            {load.isSuccess && <LoadResult run={load.data} dryRun={lastWasCheck} />}
          </div>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn --secondary"
              disabled={!canCheck}
              onClick={check}
            >
              {translate('resource-loader.check')}
            </button>
            <button
              type="button"
              className="btn --primary"
              disabled={!canImport}
              onClick={importResources}
            >
              {translate('resource-loader.import')}
            </button>
          </div>
        </div>
      </div>
    </Can>
  );
};
