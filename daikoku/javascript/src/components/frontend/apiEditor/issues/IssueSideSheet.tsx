import { constraints, Form, format, FormRef, Schema, type } from '@maif/react-forms';
import { useContext, useRef, useState } from 'react';

import { I18nContext } from '../../../../contexts';
import { IIssuesTag, Issue } from '../../../../types';
import { SideSheet, SideSheetActions } from '../../../utils';

export type IssueFormValue = {
  title: string;
  apiVersion?: string;
  tags: Array<string>;
  comment?: string;
};

type IssueSideSheetProps = {
  issue?: Issue;
  versions: Array<string>;
  tags: Array<IIssuesTag>;
  canManageTags: boolean;
  onSave: (value: IssueFormValue) => Promise<unknown>;
  onClose: () => void;
};

export const IssueSideSheet = (props: IssueSideSheetProps) => {
  const { translate } = useContext(I18nContext);

  const formRef = useRef<FormRef | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const creation = !props.issue;

  const schema: Schema = {
    title: {
      type: type.string,
      label: translate('Title'),
      constraints: [constraints.required(translate('constraints.required.title'))],
    },
    apiVersion: {
      type: type.string,
      format: format.select,
      label: translate('issues.apiVersion'),
      options: props.versions.map((version) => ({ label: version, value: version })),
      visible: props.versions.length > 1,
      constraints: [constraints.required(translate('constraints.required.version'))],
    },
    tags: {
      type: type.string,
      format: format.select,
      isMulti: true,
      label: translate('issues.tags'),
      options: props.tags.map((tag) => ({ label: tag.name, value: tag.id })),
      visible: props.canManageTags,
    },
    comment: {
      type: type.string,
      format: format.markdown,
      label: translate('issues.new_comment'),
      props: { height: '320px' },
      visible: creation,
      constraints: creation ? [constraints.required(translate('constraints.required.content'))] : [],
    },
  };

  const value: IssueFormValue = {
    title: props.issue?.title ?? '',
    apiVersion: props.issue?.apiVersion ?? (props.versions.length === 1 ? props.versions[0] : undefined),
    tags: props.issue?.tags.map((tag) => tag.id) ?? [],
  };

  const submit = (data: IssueFormValue) => {
    setSaving(true);
    props.onSave(data).finally(() => setSaving(false));
  };

  return (
    <SideSheet
      title={translate(creation ? 'issues.new_issue' : 'issues.edit')}
      size="wide"
      onClose={props.onClose}
      isDirty={() => !!formRef.current?.methods.formState.isDirty}
      footer={(requestClose) => (
        <SideSheetActions
          onCancel={requestClose}
          onSave={() => formRef.current?.handleSubmit()}
          saveLabel={creation ? translate('Create') : undefined}
          saveDisabled={saving}
        />
      )}
    >
      <Form ref={formRef} schema={schema} value={value} onSubmit={submit} footer={() => <></>} />
    </SideSheet>
  );
};
