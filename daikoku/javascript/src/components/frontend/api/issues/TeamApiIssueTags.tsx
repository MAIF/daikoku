import { constraints, type } from '@maif/react-forms';
import uniq from 'lodash/uniq';
import { useContext, useEffect, useState } from 'react';
import { SketchPicker } from 'react-color';
import RefreshCcw from 'react-feather/dist/icons/refresh-ccw';

import { ModalContext } from '../../../../contexts';
import { I18nContext } from '../../../../contexts';
import { randomColor } from '../../../utils';
import { nanoid } from 'nanoid';

export function TeamApiIssueTags({ value, onChange }: any) {
  const [api, setApi] = useState(value);
  const [updated, setUpdated] = useState(false);

  const { translate } = useContext(I18nContext);
  const { openFormModal } = useContext(ModalContext);

  function deleteTag(id: any) {
    const updatedApi = {
      ...api,
      issuesTags: [...api.issuesTags.filter((iss: any) => iss.id !== id)],
    };
    onChange(updatedApi);
    setApi(updatedApi);
  }

  return (
    <div style={{ paddingBottom: '250px' }}>
      <div className="mb-3 row">
        <div className="col-sm-10">
          <button
            className="btn btn-outline-success"
            onClick={() =>
              openFormModal({
                title: translate('issues.create_tag'),
                schema: {
                  name: {
                    type: type.string,
                    label: translate('Name'),
                    constraints: [
                      constraints.required(
                        translate('constraints.required.name')
                      ),
                    ],
                  },
                  color: {
                    type: type.string,
                    label: translate('Color'),
                    defaultValue: '#fd0643',
                    render: ({ value, onChange }: any) => {
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
                        translate('color.unavailable')
                      ),
                    ],
                  },
                },
                onSubmit: (data: any) => {
                  const updatedApi = {
                    ...api,
                    issuesTags: [...api.issuesTags, { ...data, id: nanoid() }],
                  };
                  onChange(updatedApi);
                  setApi(updatedApi);
                },
                value: { color: randomColor() },
                actionLabel: translate('Create'),
              })
            }
          >
            {translate('issues.new_tag')}
          </button>
        </div>
      </div>
      <div className="mb-3 row pt-3">
        <label className="col-xs-12 col-sm-2">{translate('issues.tags')}</label>
        <div className="col-sm-10">
          {api.issuesTags
            .sort((a: any, b: any) => a.id.localeCompare(b.id))
            .map((issueTag: any, i: any) => (
              <div
                key={`issueTag${i}`}
                className="d-flex align-items-center mt-2"
              >
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
                      issuesTags: api.issuesTags.map((issue: any, j: any) => {
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
                  handleColorChange={(color: any) => {
                    setApi({
                      ...api,
                      issuesTags: api.issuesTags.map((issue: any, j: any) => {
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
                    {translate('Delete')}
                  </button>
                </div>
              </div>
            ))}
          {api.issuesTags.length === 0 && <p>{translate('issues.no_tags')}</p>}
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
            {translate('Save')}
          </button>
        </div>
      )}
    </div>
  );
}

function ColorTag({
  initialColor,
  handleColorChange,
  presetColors,
  className,
}: any) {
  const sketchColorToReadableColor = (c: any) => {
    if (c.r) {
      return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
    } else {
      return c;
    }
  };

  const [color, setColor] = useState(sketchColorToReadableColor(initialColor));
  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const [pickerValue, setPickerValue] = useState(null);

  console.debug({ color, t: sketchColorToReadableColor(initialColor) })

  const styles = {
    color: {
      width: '36px',
      height: '14px',
      borderRadius: '2px',
      background: `${sketchColorToReadableColor(initialColor)}`,
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
      position: 'absolute' as any,
      zIndex: '2',
    },
    cover: {
      position: 'fixed' as any,
      top: '0px',
      right: '0px',
      bottom: '0px',
      left: '0px',
    },
  };

  useEffect(() => {
    if (pickerValue) {
      if ((pickerValue as any).rgb.a === 1) {
        setColor((pickerValue as any).hex);
        handleColorChange((pickerValue as any).hex);
      } else {
        setColor((pickerValue as any).rgb);
        handleColorChange((pickerValue as any).rgb);
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
          <div
            style={styles.cover}
            onClick={() => setDisplayColorPicker(false)}
          />
          {/* @ts-ignore */}
          <SketchPicker
            presetColors={uniq<any>(presetColors).sort()}
            color={color}
            onChange={(value: any) => setPickerValue(value)}
          />
        </div>
      ) : null}
    </div>
  );
}
