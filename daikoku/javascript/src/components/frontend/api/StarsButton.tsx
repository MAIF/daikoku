import classNames from "classnames";
import { GlobalContext } from "../../../contexts/globalContext";
import { useContext } from "react";
import { I18nContext } from "../../../contexts";

type StarButtonProps = {
  toggleStar: () => void
  starred: boolean
}
const StarsButton = ({ toggleStar, starred }: StarButtonProps) => {
  const { connectedUser } = useContext(GlobalContext)
  const { translate } = useContext(I18nContext)

  if (connectedUser && !connectedUser.isGuest) {
    return (
      <button
        className="favorite-btn"
        style={{background: 'none', border: 'none'}}
        aria-label={translate(starred ? "api.home.remove.api.to.favorite" : "api.home.add.api.to.favorite")}
        onClick={toggleStar}
      >
        <i className={classNames("fas", {
          'fa-thumbtack-slash': starred,
          'fa-thumbtack': !starred,
        })} />
      </button>
    )
  }
}

export default StarsButton;
