import React, { useState, useEffect } from 'react';
import { PropTypes } from 'prop-types';
import Select from 'react-select';
import { toastr } from 'react-redux-toastr';

import { Spinner, formatPlanType, Option } from '../../utils';
import * as Services from '../../../services';
import { ObjectInput, Collapse } from '../../inputs';

export const SubscriptionMetadataModal = (props) => {
  const [loading, setLoading] = useState(true);
  const [api, setApi] = useState(undefined);
  const [plan, setPlan] = useState(undefined);
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
      const maybeSubMetadata = Option(props.subscription)
        .map(s => s.customMetadata)
        .map(v => Object.entries(v))
        .getOrElse([]);

      const [maybeMetadata, maybeCustomMetadata] = maybeSubMetadata.reduce(([accMeta, accCustomMeta], item) => {
        if (plan.otoroshiTarget.apikeyCustomization.askedMetadata.some(x => x.key === item[0])) {
          return [[...accMeta, item], accCustomMeta];
        }
        return [accMeta, [...accCustomMeta, item]];
      }, [[], []]);

      setMetadata(Object.fromEntries(maybeMetadata));
      setCustomMetadata(Object.fromEntries(maybeCustomMetadata));
    }
  }, [plan]);

  const validate = () => Object.entries({ ...customMetadata, ...metadata }).every(([_, value]) => !!value) && plan && plan.otoroshiTarget.apikeyCustomization.askedMetadata.length === Object.keys(metadata).length;

  useEffect(() => {
    setIsValid(validate());
  }, [metadata, customMetadata]);


  useEffect(() => {
    Services.getVisibleApi(props.api)
      .then((api) => {
        if (api.error) {
          toastr.error(api.error);
          props.closeModal();
        } else {
          setApi(api);
        }
        setLoading(false);
      });
  }, []);

  const actionAndClose = (action) => {
    if (isValid()) {
      if (action instanceof Promise) {
        action({ ...customMetadata, ...metadata }).then(() => props.closeModal());
      } else {
        props.closeModal();
        action({ ...customMetadata, ...metadata });
      }
    }
  };

  const renderInput = (key, possibleValues) => {

    if (!possibleValues || possibleValues.length == 0) {
      return (
        <input
          className="form-control flex-grow-1"
          value={metadata[key] || ''}
          onChange={e => setMetadata({ ...metadata, [key]: e.target.value })}
          required
        />
      );
    } else {
      return (
        <Select
          className="reactSelect flex-grow-1"
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
      <div className="modal-body">
        {loading && <Spinner />}
        {!loading && !!api && !!plan && (
          <>
            {props.creationMode && <div className="modal-description">{props.team.name} ask you an apikey for plan {plan.customName || formatPlanType(plan)}</div>}
            {!props.creationMode && <div className="modal-description">Team: {props.team.name} - Plan: {plan.customName || formatPlanType(plan)}</div>}
            <Collapse label={`Mandatory metadata (${plan.otoroshiTarget.apikeyCustomization.askedMetadata.length})`} collapsed={false}>
              {plan.otoroshiTarget.apikeyCustomization.askedMetadata.map(({ key, possibleValues }, idx) => {
                return (
                  <div className="d-flex flex-row mb-1" key={idx}>
                    <input className="form-control col-5 mr-1" value={key} disabled='disabled' />
                    {renderInput(key, possibleValues)}
                  </div>
                );
              })}
            </Collapse>
            <Collapse label="Custom metadata" collapsed={true}>
              <ObjectInput
                value={customMetadata}
                onChange={(values) => {
                  setCustomMetadata({ ...values });
                }}
              />
            </Collapse>
          </>
        )}
        <div className="modal-footer">
          <button type="button" className="btn btn-outline-danger" onClick={() => props.closeModal()}>
            Cancel
            </button>
          <button
            type="button"
            className="btn btn-outline-success"
            disabled={isValid ? undefined : 'disabled'}
            onClick={() => actionAndClose(props.save)}>
            {props.creationMode ? 'Accept' : 'Update'}
          </button>
        </div>
      </div>
    </div>
  );
};

SubscriptionMetadataModal.propTypes = {
  closeModal: PropTypes.func.isRequired,
  save: PropTypes.func.isRequired,
};
