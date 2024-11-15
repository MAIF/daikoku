import { Form, format, type } from '@maif/react-forms';
import { useQueryClient } from '@tanstack/react-query';
import hljs from 'highlight.js';
import { useContext, useEffect } from 'react';
import More from 'react-feather/dist/icons/more-vertical';
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
      <Can I={manage} a={API} team={ownerTeam}>
        <More
          className="a-fake"
          aria-label={translate('update.api.description.btn.label')}
          data-bs-toggle="dropdown"
          aria-expanded="false"
          id={`${api._humanReadableId}-dropdownMenuButton`}
          style={{ position: "absolute", right: 0 }} />
        <div className="dropdown-menu" aria-labelledby={`${api._humanReadableId}-dropdownMenuButton`}>
          <span
            onClick={() => openRightPanel({
              title: translate('update.api.description.panel.title'),
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
                      .then(() => queryClient.invalidateQueries({ queryKey: ["api"] })) //todo: get the right keys
                      .then(() => closeRightPanel())
                      .then(() => toast.success("update.api.sucecssful.toast.label"))
                  }}
                  value={api}
                />
              </div>
            })}
            className="dropdown-item cursor-pointer"
          >
            {translate('api.home.update.description.btn.label')}
          </span>
        </div>
      </Can>
    </div>
  );
};