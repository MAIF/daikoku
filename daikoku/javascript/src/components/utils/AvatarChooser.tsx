import React, { useContext } from 'react';
import { AssetChooserByModal, MimeTypeFilter } from '../frontend';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'js-m... Remove this comment to see the full error message
import md5 from 'js-md5';
// @ts-expect-error TS(6142): Module '../../locales/i18n-context' was resolved t... Remove this comment to see the full error message
import { I18nContext } from '../../locales/i18n-context';

function Gravatar(props: any) {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);
  const setGravatarLink = () => {
    const email = props.rawValue?.contact?.toLowerCase().trim() || '';
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    props.onChange(url);
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <button type="button" className="btn btn-access" onClick={setGravatarLink}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <i className="fas fa-user-circle me-1" />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Translation i18nkey="gravatar.btn.label">Set avatar from Gravatar</Translation>
    </button>
  );
}

function AssetButton(props: any) {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <AssetChooserByModal
      // @ts-expect-error TS(2322): Type '{ typeFilter: (value: any) => any; onlyPrevi... Remove this comment to see the full error message
      typeFilter={MimeTypeFilter.image}
      onlyPreview
      tenantMode={false}
      team={props.team()}
      label={translateMethod('Set avatar from asset')}
      onSelect={(asset: any) => props.onChange(asset.link)}
    />
  );
}

export const AvatarChooser = (props: any) => {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className='d-flex align-items-center'>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex justify-content-start align-items-center mb-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="ms-1 avatar__container">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <img src={props.rawValues.avatar} className="img-fluid" alt="avatar" />
        </div>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className='flex-grow-1 ms-3'>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <input className='mrf-input mb-3' value={props.value} onChange={props.onChange} />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col-12 d-flex justify-content-end">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Gravatar {...props} />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <AssetButton {...props} />
        </div>
      </div>
    </div>
  );
};
