import { AssetsList, TeamBackOfficeProps } from '../';

export const TeamAssets = (props: TeamBackOfficeProps) => {

  return <AssetsList currentTeam={props.currentTeam} />;

};
