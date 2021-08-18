import React, { useState } from 'react';

import { Spinner } from '../../utils';
import * as Services from '../../../services';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

export const TestingApiKeyModal = (props) => {
  const [config, setConfig] = useState({ ...props.config });

  const { translateMethod, Translation } = useContext(I18nContext);

  const otoroshiFlow = ['otoroshiSettings', 'serviceGroup'];
  const otoroshiForm = (_found) => {
    if (!_found || !_found.otoroshiSettings) {
      return {
        otoroshiSettings: {
          type: 'select',
          props: {
            label: translateMethod('Otoroshi instance'),
            possibleValues: props.otoroshiSettings.map((s) => ({
              label: s.url,
              value: s._id,
            })),
          },
        },
        serviceGroup: {
          type: 'select',
          disabled: true,
          props: {
            label: translateMethod('Otoroshi instance'),
          },
        },
      };
    }
    const form = {
      otoroshiSettings: {
        type: 'select',
        props: {
          label: translateMethod('Otoroshi instance'),
          possibleValues: props.otoroshiSettings.map((s) => ({
            label: s.url,
            value: s._id,
          })),
        },
      },
      serviceGroup: {
        type: 'select',
        props: {
          label: translateMethod('Service group'),
          valuesFrom: `/api/teams/${props.teamId}/tenant/otoroshis/${_found.otoroshiSettings}/groups`,
          transformer: (s) => ({ label: s.name, value: s.id }),
        },
      },
    };
    return form;
  };

  const apiKeyAction = () => {
    if (!props.config.otoroshiSettings) {
      generateApiKey();
    } else {
      updateApiKey();
    }
  };

  const generateApiKey = () => {
    Services.createTestingApiKey(props.teamId, { ...config, ...props.metadata }).then((apikey) => {
      props.closeModal();
      props.onChange(apikey, { ...config, ...props.metadata });
    });
  };

  const updateApiKey = () => {
    Services.updateTestingApiKey(props.teamId, { ...config, ...props.metadata }).then((apikey) => {
      props.closeModal();
      props.onChange(apikey, { ...config, ...props.metadata });
    });
  };

  return (
    <div className="modal-content" style={{ fontWeight: 'normal' }}>
      <div className="modal-header">
        <h5 className="modal-title">{props.title}</h5>
        <button type="button" className="close" aria-label="Close" onClick={props.closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className="modal-body">
        <React.Suspense fallback={<Spinner />}>
          <LazyForm
            flow={otoroshiFlow}
            schema={otoroshiForm(config)}
            value={config}
            onChange={(c) => setConfig({ ...config, ...c })}
          />
        </React.Suspense>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={() => props.closeModal()}>
          <Translation i18nkey="Cancel">
            Cancel
          </Translation>
        </button>
        <button
          type="button"
          className="btn btn-outline-success"
          onClick={apiKeyAction}
          disabled={!config.otoroshiSettings && !config.serviceGroup ? 'disabled' : undefined}>
          <Translation
            i18nkey={props.update ? 'Update' : 'Create'}
           >
            {props.update ? 'Update' : 'Create'}
          </Translation>
        </button>
      </div>
    </div>
  );
};
