import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import { Spinner } from './Spinner';

import { GlobalContext } from '../../contexts/globalContext';
import { ICmsPageGQL, isError } from '../../types';
import { CmsViewer } from '../frontend/CmsViewer';
import * as Services from '../../services';

export const Footer = () => {

  const { customGraphQLClient } = useContext(GlobalContext)

  const pageRequest = useQuery({
    queryKey: ["footer-cms-page"],
    queryFn: () => customGraphQLClient.request<{ page: ICmsPageGQL }>(Services.graphql.getCmsPageByName, { name: 'footer.html' }),
  })
  

  if (pageRequest.isLoading) {
    return <Spinner />
  } else if (pageRequest.data?.page && !isError(pageRequest.data)) {
    return (
      <CmsViewer className='footer row mt-2' pageId={pageRequest.data.page.id} />
    )
  } else {
    return null;
  }

};
