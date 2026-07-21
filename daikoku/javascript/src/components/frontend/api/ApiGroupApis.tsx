
import { IApi } from '../../../types';
import { ApiList } from '../dashboard/ApiList';

type ApiGroupApisProps = {
  apiGroup: IApi
}
export const ApiGroupApis = ({
  apiGroup,
}: ApiGroupApisProps) => {

  return (
    <ApiList
      apiGroupId={apiGroup._id}
    />
  );
};
