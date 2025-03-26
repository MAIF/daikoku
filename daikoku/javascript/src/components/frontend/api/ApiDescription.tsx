import { Form, format, type } from '@maif/react-forms';
import { useQueryClient } from '@tanstack/react-query';
import hljs from 'highlight.js';
import { useContext, useEffect } from 'react';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../contexts';
import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import { IApi, ITeamSimple } from '../../../types';
import { api as API, Can, manage } from '../../utils';

import 'highlight.js/styles/monokai.css';

(window as any).hljs = hljs;


type ApiDescriptionProps = {
  api: IApi
  ownerTeam: ITeamSimple
}
export const ApiDescription = ({
  api,
  ownerTeam
}: ApiDescriptionProps) => {

  const queryClient = useQueryClient();
  const { openRightPanel, closeRightPanel } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);


  useEffect(() => {
    (window as any).$('pre code').each((i: any, block: any) => {
      hljs.highlightElement(block);
    });
  }, []);

  return (
    <div className="d-flex col flex-column p-3 section" style={{ position: 'relative' }}>
      <div
        className="api-description"
        dangerouslySetInnerHTML={{ __html: converter.makeHtml(api.description) }}
      />
      {api.visibility !== 'AdminOnly' && <Can I={manage} a={API} team={ownerTeam}>
        <button
          className="btn btn-sm btn-outline-primary px-3"
          aria-label={translate("api.home.config.api.aria.label")}
          style={{ position: "absolute", right: 0, top: 0 }}
          onClick={() => openRightPanel({
            title: translate('api.home.description.right.panel.title'),
            content: <div>
              <Form
                schema={{
                  description: {
                    type: type.string,
                    format: format.markdown,
                    label: translate('Description'),
                  },
                }}
                onSubmit={(data) => {
                  Services.saveTeamApi(ownerTeam._id, data, data.currentVersion)
                    .then(() => queryClient.invalidateQueries({ queryKey: ["api"] }))
                    .then(() => closeRightPanel())
                    .then(() => toast.success(translate("update.api.description.successful.toast.label")))
                }}
                value={api}
                options={{
                  actions: {
                    submit: { label: translate("Save") }
                  }
                }}
              />
            </div>
          })} >
          {translate('api.home.config.api.description.btn.label')}
        </button>
      </Can>}
    </div>
  );
};