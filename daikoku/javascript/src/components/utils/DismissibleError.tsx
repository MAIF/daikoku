export const DismissibleError = (props: { message: string; onClose: () => void }) => (
  <div className="alert alert-danger alert-dismissible" role="alert">
    {props.message}
    <button type="button" className="btn-close" aria-label="Close" onClick={props.onClose} />
  </div>
);
