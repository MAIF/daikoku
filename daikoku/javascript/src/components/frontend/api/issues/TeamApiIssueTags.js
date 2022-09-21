import React, { useContext, useEffect, useState } from 'react';
import { constraints, type } from '@maif/react-forms';
import uniq from 'lodash/uniq';
import { SketchPicker } from 'react-color';
import RefreshCcw from 'react-feather/dist/icons/refresh-ccw';
import { useDispatch } from 'react-redux';

import { I18nContext, openFormModal } from '../../../../core';
import { randomColor } from '../../../utils';

export function TeamApiIssueTags({ value, onChange }) {
  const [api, setApi] = useState(value);
  const [updated, setUpdated] = useState(false);

  const { translateMethod } = useContext(I18nContext);

  const dispatch = useDispatch();

  function deleteTag(id) {
    setApi({
      ...api,
      issuesTags: [...api.issuesTags.filter((iss) => iss.id !== id)],
    });
  }

  return (
    <div style={{ paddingBottom: '250px' }}>
      <div className="mb-3 row">
        <div className="col-sm-10">
          <button
            className="btn btn-outline-success"
            onClick={() =>
              dispatch(
                openFormModal({
                  title: translateMethod('issues.create_tag'),
                  schema: {
                    name: {
                      type: type.string,
                      label: translateMethod('Name'),
                      constraints: [
                        constraints.required(translateMethod('constraints.required.name')),
                      ],
                    },
                    color: {
                      type: type.string,
                      label: translateMethod('Color'),
                      defaultValue: '#fd0643',
                      render: ({ value, onChange }) => {
                        return (
                          <div className="d-flex flex-row">
                            <div
                              className="cursor-pointer me-2 d-flex align-items-center justify-content-center"
                              style={{
                                borderRadius: '4px',
                                backgroundColor: value,
                                padding: '0 8px',
                              }}
                              onClick={() => onChange(randomColor())}
                            >
                              <RefreshCcw />
                            </div>
                            <input
                              className="mrf-input"
                              value={value}
                              onChange={(e) => onChange(e.target.value)}
                            />
                          </div>
                        );
                      },
                      constraints: [
                        constraints.matches(
                          /^#(?:[a-fA-F\d]{6}|[a-fA-F\d]{3})$/gm,
                          translateMethod('color.unavailable')
                        ),
                      ],
                    },
                  },
                  onSubmit: (data) => {
                    const updatedApi = { ...api, issuesTags: [...api.issuesTags, data] };
                    onChange(updatedApi);
                    setApi(updatedApi);
                  },
                  value: { color: randomColor() },
                  actionLabel: translateMethod('Create'),
                })
              )
            }
          >
            {translateMethod('issues.new_tag')}
          </button>
        </div>
      </div>
      <div className="mb-3 row pt-3">
        <label className="col-xs-12 col-sm-2">{translateMethod('issues.tags')}</label>
        <div className="col-sm-10">
          {api.issuesTags
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((issueTag, i) => (
              <div key={`issueTag${i}`} className="d-flex align-items-center mt-2">
                <span
                  className="badge d-flex align-items-center justify-content-center px-3 py-2"
                  style={{
                    backgroundColor: issueTag.color,
                    color: '#fff',
                  }}
                >
                  {issueTag.name}
                </span>
                <input
                  type="text"
                  className="form-control mx-3"
                  value={issueTag.name}
                  onChange={(e) => {
                    setApi({
                      ...api,
                      issuesTags: api.issuesTags.map((issue, j) => {
                        if (i === j) issue.name = e.target.value;
                        return issue;
                      }),
                    });
                    setUpdated(true);
                  }}
                />
                <ColorTag
                  className="pe-3"
                  initialColor={issueTag.color}
                  handleColorChange={(color) => {
                    setApi({
                      ...api,
                      issuesTags: api.issuesTags.map((issue, j) => {
                        if (i === j) issue.color = color;
                        return issue;
                      }),
                    });
                    setUpdated(true);
                  }}
                  presetColors={[]}
                />
                <div className="ml-auto">
                  <button
                    className="btn btn-sm btn-outline-danger"
                    type="button"
                    onClick={() => deleteTag(issueTag.id)}
                  >
                    {translateMethod('Delete')}
                  </button>
                </div>
              </div>
            ))}
          {api.issuesTags.length === 0 && <p>{translateMethod('issues.no_tags')}</p>}
        </div>
      </div>
      {updated && (
        <div className="col-sm-12 d-flex justify-content-end">
          <button
            className="btn btn-outline-success ml-auto"
            onClick={() => {
              onChange(api);
              setUpdated(false);
            }}
          >
            {translateMethod('Save')}
          </button>
        </div>
      )}
    </div>
  );
}

function ColorTag({ initialColor, handleColorChange, presetColors, className }) {
  const sketchColorToReadableColor = (c) => {
    if (c.r) {
      return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
    } else {
      return c;
    }
  };

  const [color, setColor] = useState(sketchColorToReadableColor(initialColor));
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
        handleColorChange(pickerValue.hex);
      } else {
        setColor(pickerValue.rgb);
        handleColorChange(pickerValue.rgb);
      }
    }
  }, [pickerValue]);

  return (
    <div className={className}>
      <div style={styles.swatch} onClick={() => setDisplayColorPicker(true)}>
        <div style={styles.color} />
      </div>
      {displayColorPicker ? (
        <div style={styles.popover}>
          <div style={styles.cover} onClick={() => setDisplayColorPicker(false)} />
          <SketchPicker
            presetColors={uniq(presetColors).sort()}
            color={color}
            onChange={(value) => setPickerValue(value)}
          />
        </div>
      ) : null}
    </div>
  );
}
