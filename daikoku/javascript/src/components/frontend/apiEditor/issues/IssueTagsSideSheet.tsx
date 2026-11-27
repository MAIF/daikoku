import { Plus, Trash2 } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useContext, useState } from 'react';

import { I18nContext } from '../../../../contexts';
import { IIssuesTag } from '../../../../types';
import { getColorByBgColor, randomColor, SideSheet, SideSheetActions } from '../../../utils';

type IssueTagsSideSheetProps = {
  tags: Array<IIssuesTag>;
  onSave: (tags: Array<IIssuesTag>) => Promise<unknown>;
  onClose: () => void;
};

export const IssueTagsSideSheet = (props: IssueTagsSideSheetProps) => {
  const { translate } = useContext(I18nContext);

  const [tags, setTags] = useState(props.tags);
  const [saving, setSaving] = useState(false);

  const updateTag = (id: string, change: Partial<IIssuesTag>) =>
    setTags(tags.map((tag) => (tag.id === id ? { ...tag, ...change } : tag)));

  const addTag = () => setTags([...tags, { id: nanoid(), name: '', color: randomColor() }]);

  const save = () => {
    setSaving(true);
    props.onSave(tags.filter((tag) => tag.name.trim())).finally(() => setSaving(false));
  };

  return (
    <SideSheet
      title={translate('issues.tags')}
      onClose={props.onClose}
      isDirty={() => tags !== props.tags}
      footer={(requestClose) => (
        <SideSheetActions onCancel={requestClose} onSave={save} saveDisabled={saving} />
      )}
    >
      <div className="issue-tags">
        {tags.length === 0 && <p className="text-muted">{translate('issues.no_tags')}</p>}

        {tags.map((tag) => (
          <div key={tag.id} className="issue-tags__row">
            <span className="badge" style={{ backgroundColor: tag.color, color: getColorByBgColor(tag.color) }}>
              {tag.name || translate('Name')}
            </span>

            <input
              type="text"
              className="form-control"
              aria-label={translate('Name')}
              value={tag.name}
              onChange={(e) => updateTag(tag.id, { name: e.target.value })}
            />

            <input
              type="color"
              className="form-control form-control-color"
              aria-label={translate('Color')}
              value={tag.color}
              onChange={(e) => updateTag(tag.id, { color: e.target.value })}
            />

            <button
              type="button"
              className="btn --tertiary --small --icon-only"
              aria-label={translate('Delete')}
              onClick={() => setTags(tags.filter((t) => t.id !== tag.id))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <button type="button" className="btn --secondary --small align-self-start" onClick={addTag}>
          <Plus size={14} />
          {translate('issues.new_tag')}
        </button>
      </div>
    </SideSheet>
  );
};
