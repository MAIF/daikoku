import React, { useState, useEffect } from 'react';
import { PropTypes } from 'prop-types';
import Select from 'react-select';

import { Spinner, formatPlanType } from '../../utils';
import * as Services from '../../../services';
import {ObjectInput} from '../../inputs';

export const SubscriptionMetadataModal = (props) => {
  const [loading, setLoading] = useState(true);
  const [api, setApi] = useState(undefined);
  const [plan, setPlan] = useState(undefined);
  const [error, setError] = useState(undefined);
  const [metadata, setMetadata] = useState({});
  const [customMetadata, setCustomMetadata] = useState({});
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    setLoading(false);
  }, [api]);

  useEffect(() => {
    if (api) {
      setPlan(api.possibleUsagePlans.find(pp => pp._id === props.plan));
    }
  }, [api]);

  useEffect(() => {
    if (plan) {
      const entries = plan.otoroshiTarget.apikeyCustomization.askedMetadata.map(({ key, _ }) => ([key, undefined]));
      const metadata = Object.fromEntries(new Map(entries));
      setMetadata(metadata);
    }
  }, [plan]);

  const validate = () => Object.entries({...customMetadata, ...metadata}).every(([_, value]) => !!value);

  useEffect(() => {
    setIsValid(validate());
  }, [metadata, customMetadata]);


  useEffect(() => {
    Services.getVisibleApi(props.api)
      .then((api) => {
        if (api.error) {
          setError(api.error);
        } else {
          setApi(api);
        }
        setLoading(false);
      });
  }, []);

  const actionAndClose = (action) => {
    if (action instanceof Promise) {
      action({...customMetadata, ...metadata}).then(() => props.closeModal());
    } else {
      props.closeModal();
      action({ ...customMetadata, ...metadata });
    }
  };

  const renderInput = (key, possibleValues) => {
    if (!possibleValues || possibleValues.length == 0) {
      return (
        <input
          value={metadata[key]}
          onChange={e => setMetadata({ ...metadata, [key]: e.target.value })}
        />
      );
    } else {
      return (
        <Select
          className="reactSelect mb-1 col-4"
          value={{ label: metadata[key], value: metadata[key] }}
          placeholder="Select a value"
          options={possibleValues.map((v) => ({ label: v, value: v }))}
          onChange={e => setMetadata({ ...metadata, [key]: e.value })}
          classNamePrefix="reactSelect"
        />
      );
    }
  };

  return (
    <div className="modal-content">
      <div className="modal-header">
        {!api && <h5 className="modal-title">Subscription metadata</h5>}
        {api && <h5 className="modal-title">Subscription metadata - {api.name}</h5>}
        <button type="button" className="close" aria-label="Close" onClick={props.closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      {!!loading && <div className="modal-body"><Spinner /></div>}
      {!loading && !!api && !!plan && (
        <>
          <div className="modal-body">
            <div className="modal-description">{props.team.name} ask you an apikey for plan: {plan.customName || formatPlanType(plan)}</div>
            <div>You must populate some metadata or just add ones if you want</div>
            <ul>
              {plan.otoroshiTarget.apikeyCustomization.askedMetadata.map(({ key, possibleValues }, idx) => {
                return (
                  <li key={idx} >{key}: {renderInput(key, possibleValues)}</li>
                );
              })}
            </ul>
            <ObjectInput
              label='other custom metadata'
              value={customMetadata}
              onChange={(values) => {
                setCustomMetadata({ ...values });
              }}
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-danger" onClick={() => props.closeModal()}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-outline-success"
              disabled={isValid ? undefined : 'disabled'}
              onClick={() => actionAndClose(props.save)}>
              Accept
            </button>
          </div>
        </>
      )}
    </div>
  );
};

SubscriptionMetadataModal.propTypes = {
  closeModal: PropTypes.func.isRequired,
  save: PropTypes.func.isRequired,
};
