import React, { useContext, useEffect, useState } from 'react';
import { constraints, type } from '@maif/react-forms';
import uniq from 'lodash/uniq';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { SketchPicker } from 'react-color';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import RefreshCcw from 'react-feather/dist/icons/refresh-ccw';
import { useDispatch } from 'react-redux';

import { I18nContext, openFormModal } from '../../../../core';
import { randomColor } from '../../../utils';

export function TeamApiIssueTags({
  value,
  onChange
}: any) {
  const [api, setApi] = useState(value);
  const [updated, setUpdated] = useState(false);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const dispatch = useDispatch();

  function deleteTag(id: any) {
    setApi({
      ...api,
      issuesTags: [...api.issuesTags.filter((iss: any) => iss.id !== id)],
    });
  }

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div style={{ paddingBottom: '250px' }}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="mb-3 row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col-sm-10">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className='btn btn-outline-success'  onClick={() => dispatch(openFormModal({
            title: translateMethod('issues.create_tag'),
            schema: {
              name: {
                type: type.string,
                label: translateMethod('Name'),
                constraints: [
                  constraints.required(translateMethod('constraints.required.name'))
                ]
              },
              color: {
                type: type.string,
                label: translateMethod('Color'),
                defaultValue: '#fd0643',
                render: ({
                  value,
                  onChange
                }: any) => {
                  return (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <div className='d-flex flex-row'>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <div className='cursor-pointer me-2 d-flex align-items-center justify-content-center'
                        style={{ borderRadius: '4px', backgroundColor: value, padding: '0 8px' }}
                        onClick={() => onChange(randomColor())}>
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <RefreshCcw />
                      </div>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <input className='mrf-input' value={value} onChange={e => onChange(e.target.value)} />
                    </div>
                  )
                },
                constraints: [
                  constraints.matches(/^#(?:[a-fA-F\d]{6}|[a-fA-F\d]{3})$/gm, translateMethod('color.unavailable'))
                ]
              }
            },
            onSubmit: (data: any) => {
              const updatedApi = { ...api, issuesTags: [...api.issuesTags, data] };
              onChange(updatedApi);
              setApi(updatedApi)
            },
            value: { color: randomColor() },
            actionLabel: translateMethod('Create')
          }))}>{translateMethod('issues.new_tag')}</button>
        </div>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="mb-3 row pt-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <label className="col-xs-12 col-sm-2">{translateMethod('issues.tags')}</label>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col-sm-10">
          {api.issuesTags
            .sort((a: any, b: any) => a.name.localeCompare(b.name))
            .map((issueTag: any, i: any) => (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <div key={`issueTag${i}`} className="d-flex align-items-center mt-2">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <span
                  className="badge d-flex align-items-center justify-content-center px-3 py-2"
                  style={{
                    backgroundColor: issueTag.color,
                    color: '#fff',
                  }}
                >
                  {issueTag.name}
                </span>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                    })
                    setUpdated(true);
                  }}
                  presetColors={[]}
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="ml-auto">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {api.issuesTags.length === 0 && <p>{translateMethod('issues.no_tags')}</p>}
        </div>
      </div>
      {updated && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="col-sm-12 d-flex justify-content-end">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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

function ColorTag({
  initialColor,
  handleColorChange,
  presetColors,
  className
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className={className}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div style={styles.swatch} onClick={() => setDisplayColorPicker(true)}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div style={styles.color} />
      </div>
      {displayColorPicker ? (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div style={styles.popover}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div style={styles.cover} onClick={() => setDisplayColorPicker(false)} />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <SketchPicker
            presetColors={uniq(presetColors).sort()}
            color={color}
            onChange={(value: any) => setPickerValue(value)}
          />
        </div>
      ) : null}
    </div>
  );
}
