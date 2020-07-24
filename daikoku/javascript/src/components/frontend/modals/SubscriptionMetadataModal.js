import React, { useState, useEffect } from 'react';
import { PropTypes } from 'prop-types';
import Creatable from 'react-select/creatable';
import { toastr } from 'react-redux-toastr';
import _ from 'lodash';

import { Spinner, formatPlanType, Option } from '../../utils';
import * as Services from '../../../services';
import { ObjectInput, Collapse, Help, BooleanInput } from '../../inputs';
import { t, Translation } from '../../../locales';

export const SubscriptionMetadataModal = (props) => {
  const [loading, setLoading] = useState(true);
  const [api, setApi] = useState(undefined);
  const [plan, setPlan] = useState(undefined);
  const [metadata, setMetadata] = useState({});
  const [customMetadata, setCustomMetadata] = useState({});
  const [customMaxPerSecond, setCustomMaxPerSecond] = useState(undefined);
  const [customMaxPerDay, setCustomMaxPerDay] = useState(undefined);
  const [customMaxPerMonth, setCustomMaxPerMonth] = useState(undefined);
  const [customReadOnly, setCustomReadOnly] = useState(undefined);
  const [isValid, setIsValid] = useState(false);
  const [loadingInput, setLoadingInput] = useState(false);

  useEffect(() => {
    setLoading(false);
  }, [api]);

  useEffect(() => {
    if (api) {
      setPlan(api.possibleUsagePlans.find((pp) => pp._id === props.plan));
    }
  }, [api]);

  useEffect(() => {
    if (plan) {
      const maybeSubMetadata = Option(props.subscription)
        .map((s) => s.customMetadata)
        .map((v) => Object.entries(v))
        .getOrElse([]);

      const [maybeMetadata, maybeCustomMetadata] = maybeSubMetadata.reduce(
        ([accMeta, accCustomMeta], item) => {
          if (
            plan.otoroshiTarget.apikeyCustomization.customMetadata.some((x) => x.key === item[0])
          ) {
            return [[...accMeta, item], accCustomMeta];
          }
          return [accMeta, [...accCustomMeta, item]];
        },
        [[], []]
      );

      setMetadata({ ...Object.fromEntries(maybeMetadata), ...metadata });
      setCustomMetadata({ ...Object.fromEntries(maybeCustomMetadata), ...customMetadata });
      setCustomMaxPerSecond(
        Option(props.subscription)
          .map((s) => s.customMaxPerSecond)
          .getOrNull()
      );
      setCustomMaxPerDay(
        Option(props.subscription)
          .map((s) => s.customMaxPerDay)
          .getOrNull()
      );
      setCustomMaxPerMonth(
        Option(props.subscription)
          .map((s) => s.customMaxPerMonth)
          .getOrNull()
      );
      setCustomReadOnly(
        Option(props.subscription)
          .map((s) => s.customReadOnly)
          .getOrNull()
      );
    }
  }, [plan]);

  const validate = () =>
    Object.entries({ ...customMetadata, ...metadata }).every(([_, value]) => !!value) &&
    plan &&
    plan.otoroshiTarget.apikeyCustomization.customMetadata.length === Object.keys(metadata).length;

  useEffect(() => {
    setIsValid(validate());
  }, [metadata, customMetadata]);

  useEffect(() => {
    Services.getVisibleApi(props.api).then((api) => {
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
    const subProps = {
      customMetadata: {
        ...customMetadata,
        ...metadata,
      },
      customMaxPerSecond,
      customMaxPerDay,
      customMaxPerMonth,
      customReadOnly,
    };
    if (isValid) {
      if (action instanceof Promise) {
        action(subProps).then(() => props.closeModal());
      } else {
        props.closeModal();
        action(subProps);
      }
    }
  };

  const renderInput = (key, possibleValues) => {
    const createOption = (newValue) => {
      setLoadingInput(true);
      Services.saveTeamApi(api.team, {
        ...api,
        possibleUsagePlans: [
          ...api.possibleUsagePlans.filter((p) => p._id !== props.plan),
          {
            ...plan,
            otoroshiTarget: {
              ...plan.otoroshiTarget,
              apikeyCustomization: {
                ...plan.otoroshiTarget.apikeyCustomization,
                customMetadata: [
                  ...plan.otoroshiTarget.apikeyCustomization.customMetadata.filter(
                    (m) => m.key !== key
                  ),
                  { key, possibleValues: [...possibleValues, newValue] },
                ],
              },
            },
          },
        ],
      }).then((api) => {
        setMetadata({ ...metadata, [key]: newValue });
        setLoadingInput(false);
        setApi(api);
      });
    };

    if (!possibleValues || possibleValues.length == 0) {
      return (
        <input
          className="form-control flex-grow-1"
          value={metadata[key] || ''}
          onChange={(e) => setMetadata({ ...metadata, [key]: e.target.value })}
          required
        />
      );
    } else {
      return (
        <Creatable
          className="reactSelect flex-grow-1"
          isClearable={true}
          isDisabled={loadingInput}
          isLoading={loadingInput}
          onChange={(e) => setMetadata({ ...metadata, [key]: e.value })}
          onCreateOption={(v) => createOption(v)}
          options={possibleValues.sort().map((v) => ({ label: v, value: v }))}
          value={{ label: metadata[key], value: metadata[key] }}
          formatCreateLabel={(value) =>
            t(
              'create.metadata.option.label',
              props.currentLanguage,
              false,
              `Create option ${value}`,
              value
            )
          }
          classNamePrefix="reactSelect"
        />
      );
    }
  };

  return (
    <div className="modal-content">
      <div className="modal-header">
        {!api && (
          <h5 className="modal-title">
            <Translation i18nkey="Subscription metadata" language={props.currentLanguage}>
              Subscription metadata
            </Translation>
          </h5>
        )}
        {api && (
          <h5 className="modal-title">
            <Translation
              i18nkey="Subscription metadata title"
              language={props.currentLanguage}
              replacements={[api.name]}>
              Subscription metadata - {api.name}
            </Translation>
          </h5>
        )}
        <button type="button" className="close" aria-label="Close" onClick={props.closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className="modal-body">
        {loading && <Spinner />}
        {!loading && !!api && !!plan && (
          <>
            {props.creationMode && (
              <div className="modal-description">
                <Translation
                  i18nkey="subscription.metadata.modal.creation.description"
                  language={props.currentLanguage}
                  replacements={[props.team.name, plan.customName || formatPlanType(plan)]}>
                  {props.team.name} ask you an apikey for plan{' '}
                  {plan.customName || formatPlanType(plan)}
                </Translation>
              </div>
            )}
            {!props.creationMode && (
              <div className="modal-description">
                <Translation
                  i18nkey="subscription.metadata.modal.update.description"
                  language={props.currentLanguage}
                  replacements={[props.team.name, plan.customName || formatPlanType(plan)]}>
                  Team: {props.team.name} - Plan: {plan.customName || formatPlanType(plan)}
                </Translation>
              </div>
            )}
            <Collapse
              label={t(
                'mandatory.metadata.label',
                props.currentLanguage,
                false,
                `Mandatory metadata (${plan.otoroshiTarget.apikeyCustomization.customMetadata.length})`,
                plan.otoroshiTarget.apikeyCustomization.customMetadata.length
              )}
              collapsed={false}>
              {_.sortBy(plan.otoroshiTarget.apikeyCustomization.customMetadata, ['key']).map(
                ({ key, possibleValues }, idx) => {
                  return (
                    <div className="d-flex flex-row mb-1" key={idx}>
                      <input className="form-control col-5 mr-1" value={key} disabled="disabled" />
                      {renderInput(key, possibleValues)}
                    </div>
                  );
                }
              )}
            </Collapse>
            <Collapse label={t('Additional metadata', props.currentLanguage)} collapsed={true}>
              <ObjectInput
                value={customMetadata}
                onChange={(values) => {
                  setCustomMetadata({ ...values });
                }}
              />
            </Collapse>
            <Collapse label={t('Custom quotas', props.currentLanguage)} collapsed={true}>
              <div className="form-group row">
                <label
                  htmlFor={'input-max-request-per-second'}
                  className="col-xs-12 col-sm-2 col-form-label">
                  <Help text="Help" label="max-request-per-second" />
                </label>
                <div className="col-sm-10">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className="form-control"
                    id="input-max-request-per-second"
                    placeholder="max request per second"
                    value={customMaxPerSecond}
                    onChange={(e) => setCustomMaxPerSecond(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="form-group row">
                <label
                  htmlFor={'input-max-request-per-day'}
                  className="col-xs-12 col-sm-2 col-form-label">
                  <Help text="Help" label="max-request-per-day" />
                </label>
                <div className="col-sm-10">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className="form-control"
                    id="input-max-request-per-day"
                    placeholder="max request per day"
                    value={customMaxPerDay}
                    onChange={(e) => setCustomMaxPerDay(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="form-group row">
                <label
                  htmlFor={'input-max-request-per-month'}
                  className="col-xs-12 col-sm-2 col-form-label">
                  <Help text="Help" label="max-request-per-month" />
                </label>
                <div className="col-sm-10">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className="form-control"
                    id="input-max-request-per-month"
                    placeholder="max request per month"
                    value={customMaxPerMonth}
                    onChange={(e) => setCustomMaxPerMonth(Number(e.target.value))}
                  />
                </div>
              </div>
            </Collapse>
            <Collapse label={t('Other custom props', props.currentLanguage)} collapsed={true}>
              <div className="form-group row">
                <label className="col-xs-12 col-sm-2 col-form-label">
                  <Help text="Help" label="custom read only" />
                </label>
                <div className="col-sm-10">
                  <BooleanInput
                    value={customReadOnly}
                    onChange={(readOnly) => setCustomReadOnly(readOnly)}
                  />
                </div>
              </div>
            </Collapse>
          </>
        )}
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-outline-danger"
            onClick={() => props.closeModal()}>
            <Translation i18nkey="Cancel" language={props.currentLanguage}>
              Cancel
            </Translation>
          </button>
          <button
            type="button"
            className="btn btn-outline-success"
            disabled={isValid ? undefined : 'disabled'}
            onClick={() => actionAndClose(props.save)}>
            {props.creationMode
              ? t('Accept', props.currentLanguage)
              : t('Update', props.currentLanguage)}
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
