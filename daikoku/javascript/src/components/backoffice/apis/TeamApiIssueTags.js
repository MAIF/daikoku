
import React, { useEffect, useState } from 'react';
import { SketchPicker } from 'react-color';
import { toastr } from 'react-redux-toastr';
import { t } from '../../../locales';

export function TeamApiIssueTags({ value, onChange, currentLanguage }) {
  const [showTagForm, showNewTagForm] = useState(false);
  const [issuesTags, setIssueTags] = useState([])

  useEffect(() => {
    setIssueTags(value.issuesTags)
  }, [value.issuesTags])

  function deleteTag(id) {
    onChange({
      ...value,
      issuesTags: [...issuesTags.filter(iss => iss.id !== id)]
    })
  }

  return (
    <div style={{ paddingBottom: '250px' }}>
      {showTagForm ? <NewTag
        issuesTags={issuesTags}
        currentLanguage={currentLanguage}
        handleCreate={newTag => {
          onChange({ ...value, issuesTags: [...issuesTags, newTag] })
          showNewTagForm(false)
        }}
        onCancel={() => showNewTagForm(false)} /> :
        <div className="form-group row">
          <label className="col-xs-12 col-sm-2 col-form-label">Actions</label>
          <div className="col-sm-10">
            <button className="btn btn-success"
              onClick={() => showNewTagForm(true)}>{t('issues.new_tag', currentLanguage)}</button>
          </div>
        </div>
      }
      <div className="form-group row pt-3">
        <label className="col-xs-12 col-sm-2 col-form-label">{t('issues.tags', currentLanguage)}</label>
        <div className="col-sm-10">
          {issuesTags.map((issueTag, i) => (
            <div key={`issueTag${i}`} className="d-flex align-items-center mt-2">
              <span className="badge badge-primary d-flex align-items-center justify-content-center px-3 py-2"
                style={{
                  backgroundColor: issueTag.color,
                  color: "#fff",
                  borderRadius: "12px"
                }}>{issueTag.name}</span>
              <input type="text" className="form-control mx-3" value={issueTag.name} onChange={e => onChange({
                ...value, issuesTags: issuesTags.map((issue, j) => {
                  if (i === j)
                    issue.name = e.target.value
                  return issue;
                })
              })} />
              <ColorTag
                className="pr-3"
                initialColor={issueTag.color}
                handleColorChange={color => onChange({
                  ...value, issuesTags: issuesTags.map((issue, j) => {
                    if (i === j)
                      issue.color = color
                    return issue;
                  })
                })}
                presetColors={[]} />
              <div className="ml-auto">
                <button className="btn btn-sm btn-outline-danger" type="button" onClick={() => deleteTag(issueTag.id)}>{t('Delete', currentLanguage)}</button>
              </div>
            </div>
          ))}
          {issuesTags.length === 0 && <p>{t('issues.no_tags', currentLanguage)}</p>}
        </div>
      </div>
    </div >
  )
}

function NewTag({ issuesTags, handleCreate, onCancel, currentLanguage }) {
  const [tag, setTag] = useState({ name: '', color: '#2980b9' });

  function confirmTag() {
    if (tag.name.length <= 0)
      toastr.error("Tag name must be filled");
    else if (issuesTags.find(t => t.name === tag.name))
      toastr.error("Tag name already existing");
    else {
      handleCreate(tag);
      setTag({ name: '', color: '#2980b9' });
    }
  }

  return (
    <div className="form-group row">
      <label className="col-xs-12 col-sm-2 col-form-label">{t('issues.new_tag', currentLanguage)}</label>
      <div className="col-sm-10">
        <div className="d-flex align-items-end">
          <div className="pr-3" style={{ flex: .5 }}>
            <label htmlFor="tag">{t('issues.tag_name', currentLanguage)}</label>
            <input
              className="form-control"
              type="text" id="tag" value={tag.name}
              onChange={e => setTag({ ...tag, name: e.target.value })} placeholder={t('issues.tag_name', currentLanguage)} />
          </div>
          <div className="px-3">
            <label htmlFor="color">{t('issues.tag_color', currentLanguage)}</label>
            <ColorTag
              initialColor={'#2980b9'}
              handleColorChange={color => setTag({ ...tag, color })}
              presetColors={[]} />
          </div>
          <div className="ml-auto">
            <button className="btn btn-outline-danger mr-2" type="button" onClick={onCancel}>{t('Cancel', currentLanguage)}</button>
            <button className="btn btn-outline-success" type="button" onClick={confirmTag}>{t('issues.create_tag', currentLanguage)}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ColorTag({ initialColor, handleColorChange, presetColors, className }) {
  const sketchColorToReadableColor = (c) => {
    if (c.r) {
      return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
    } else {
      return c;
    }
  };

  const [color, setColor] = useState(initialColor);
  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const [pickerValue, setPickerValue] = useState(null);

  const styles = {
    color: {
      width: '36px',
      height: '14px',
      borderRadius: '2px',
      background: `${color}`,
    },
    swatch: {
      padding: '5px',
      background: '#fff',
      borderRadius: '1px',
      boxShadow: '0 0 0 1px rgba(0,0,0,.1)',
      display: 'inline-block',
      cursor: 'pointer',
    },
    popover: {
      position: 'absolute',
      zIndex: '2',
    },
    cover: {
      position: 'fixed',
      top: '0px',
      right: '0px',
      bottom: '0px',
      left: '0px',
    },
  };

  useEffect(() => {
    if (pickerValue) {
      if (pickerValue.rgb.a === 1) {
        setColor(pickerValue.hex);
      } else {
        setColor(pickerValue.rgb);
      }
    }
  }, [pickerValue]);

  useEffect(() => {
    handleColorChange(sketchColorToReadableColor(color));
  }, [color]);

  useEffect(() => {
    setColor(initialColor);
  }, [initialColor]);

  return (
    <div className={className}>
      <div style={styles.swatch} onClick={() => setDisplayColorPicker(true)}>
        <div style={styles.color} />
      </div>
      {displayColorPicker ? (
        <div style={styles.popover}>
          <div style={styles.cover} onClick={() => setDisplayColorPicker(false)} />
          <SketchPicker
            presetColors={_.uniq(presetColors).sort()}
            color={color}
            onChange={(value) => setPickerValue(value)}
          />
        </div>
      ) : null}
    </div>
  );
}