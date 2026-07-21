import { useContext, useEffect, useState } from 'react';
import { I18nContext } from '../../../contexts';
import { useNavigate, useParams } from 'react-router-dom';
import * as Services from '../../../services';

import { Spinner } from '../../utils/Spinner';
import { Form, format, type } from '@maif/react-forms';
import { GlobalContext } from '../../../contexts/globalContext';
import { ICmsPageGQL } from '../../../types/gql';


export const Create = () => {
  const { translate } = useContext(I18nContext);
  const { customGraphQLClient } = useContext(GlobalContext);

  const params = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);

  const [value, setValue] = useState({});

  useEffect(() => {
    const id = params.id;
    if (id) {
      setLoading(true);
      customGraphQLClient.request<{ cmsPage: ICmsPageGQL }>(Services.graphql.getCmsPage(id))
        .then((res) => {
          setValue(res.cmsPage.body);
          setLoading(false);
        });
    }
  }, [params.id]);


  if (loading) {
    return <Spinner />;
  }

  const schema = {
    content: {
      label: translate('cms.create.content'),
      type: type.string,
      format: format.code
    }
  }
  const flow = ['content']

  return <>
    <button className="btn --secondary mt-2" type="button"
      onClick={() => navigate('/settings/pages', { state: { reload: true } })}>
      {translate('cms.create.back_to_pages')}
    </button>
    <Form
      schema={schema}
      flow={flow}
      value={{ content: value }}
      footer={() => <></>}
      onSubmit={() => { }} />
  </>
};
