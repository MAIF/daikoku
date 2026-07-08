import { nanoid } from 'nanoid';
import { useEffect, useState, useMemo, PropsWithChildren } from 'react';
import { Check, Loader } from "lucide-react";
import classNames from 'classnames';
import { isError } from '../../types';

type ButtonType = 'success' | 'warning' | 'info' | 'danger' | 'primary' | 'secondary'
type Props = {
  title?: string
  type?: ButtonType,
  onPress: () => Promise<any>,
  beforePress?: () => Promise<boolean>,
  onSuccess?: () => void,
  feedbackTimeout?: number,
  feedbackMessages?: { success?: string, fail?: string },
  error?: string,
  className?: string,
  disabled?: boolean,
  style?: { [key: string]: string },
}
export function FeedbackButton(props: PropsWithChildren<Props>) {
  const [uploading, setUploading] = useState(false);
  const [result, onResult] = useState('waiting');
  const [caughtError, setCaughtError] = useState<string | undefined>(undefined);
  // const [color, setColor] = useState<ButtonType>(props.type);
  const id = useMemo(() => nanoid(), [])

  useEffect(() => {
    let timeout;

    if (result === "success") {
      setUploading(false)
      timeout = setTimeout(() => onResult("waiting"), props.feedbackTimeout)
    }
    if (result === "failed") {
      setUploading(false)
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    };

  }, [result, props.feedbackTimeout])

  const failed = result === 'failed';
  const successed = result === 'success';
  const waiting = result === 'waiting';
  const loading = waiting && uploading;


  const setStyle = () => {
    if (failed) {
      const { ...rest } = props.style || {};
      return rest;
    } else {
      return props.style;
    }
  };

  return (
    <div className="feedback-button-wrapper">
      <button
        id={id}
        title={props.title}
        type="button"
        disabled={props.disabled ?? loading}
        className={classNames(props.className, { '--icon-only': loading })}
        style={setStyle()}
        onClick={() => {
          if (!uploading) {
            onResult('waiting');
            setCaughtError(undefined);
            setUploading(true);
            const timer = Date.now();
            props.onPress()
              .then(() => {
                const diff = Date.now() - timer;
                if (diff > 150) {
                  if (props.onSuccess) setTimeout(props.onSuccess, 250);
                  onResult('success');
                } else {
                  setTimeout(() => {
                    onResult('success');
                    if (props.onSuccess) setTimeout(props.onSuccess, 250);
                  }, 150 - diff);
                }
              })
              .catch((err) => {
                onResult('failed');
                setCaughtError(props.feedbackMessages?.fail ?? (isError(err) ? err.error : undefined));
                throw err;
              });
          }
        }}>
        {loading && (
          <>
            <Loader className='--rotate' style={{ opacity: loading ? 1 : 0 }} />
          </>
        )}
        {successed && (
          <>
            <Check
              style={{
                opacity: successed ? 1 : 0,
                transition: 'opacity 2s',
              }}
            />
            {props.feedbackMessages?.success}
          </>
        )}
        {!loading && !successed && props.children}
      </button>
      {failed && (caughtError ?? props.error ?? props.feedbackMessages?.fail) && (
        <div className="feedback-button-error">
          {caughtError ?? props.error ?? props.feedbackMessages?.fail}
        </div>
      )}
    </div>
  );
}
