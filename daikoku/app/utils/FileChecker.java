package utils;

import scala.Option;
import scala.Option$;

public class FileChecker {

    public static Option<Boolean> isWellSigned(String type, byte[] bytes) {
        // signature (magic number)
        switch (type) {
            case "image/jpeg":
            case "image/jpg":
                return Option.apply("FF".equalsIgnoreCase(Integer.toHexString((int) bytes[0] & 0xFF))
                        && "D8".equalsIgnoreCase(Integer.toHexString((int) bytes[1] & 0xFF))
                        && "FF".equalsIgnoreCase(Integer.toHexString((int) bytes[2] & 0xFF))
                        && ("DB".equalsIgnoreCase(Integer.toHexString((int) bytes[3] & 0xFF))
                        || "E0".equalsIgnoreCase(Integer.toHexString((int) bytes[3] & 0xFF))
                        || "E1".equalsIgnoreCase(Integer.toHexString((int) bytes[3] & 0xFF))));
            case "image/tiff":
                return Option.apply(("49".equalsIgnoreCase(Integer.toHexString((int) bytes[0] & 0xFF))
                        && "49".equalsIgnoreCase(Integer.toHexString((int) bytes[1] & 0xFF))
                        && "2A".equalsIgnoreCase(Integer.toHexString((int) bytes[2] & 0xFF))
                        && "0".equalsIgnoreCase(Integer.toHexString((int) bytes[3] & 0xFF)))
                        || ("4D".equalsIgnoreCase(Integer.toHexString((int) bytes[0] & 0xFF))
                        && "4D".equalsIgnoreCase(Integer.toHexString((int) bytes[1] & 0xFF))
                        && "0".equalsIgnoreCase(Integer.toHexString((int) bytes[2] & 0xFF))
                        && "2A".equalsIgnoreCase(Integer.toHexString((int) bytes[3] & 0xFF))));
            case "application/pdf":
                return Option.apply("25".equalsIgnoreCase(Integer.toHexString((int) bytes[0] & 0xFF))
                        && "50".equalsIgnoreCase(Integer.toHexString((int) bytes[1] & 0xFF))
                        && "44".equalsIgnoreCase(Integer.toHexString((int) bytes[2] & 0xFF))
                        && "46".equalsIgnoreCase(Integer.toHexString((int) bytes[3] & 0xFF)));
            case "image/png": {
                return Option.apply("89".equalsIgnoreCase(Integer.toHexString((int) bytes[0] & 0xFF))
                        && "50".equalsIgnoreCase(Integer.toHexString((int) bytes[1] & 0xFF))
                        && "4E".equalsIgnoreCase(Integer.toHexString((int) bytes[2] & 0xFF))
                        && "47".equalsIgnoreCase(Integer.toHexString((int) bytes[3] & 0xFF)));
            }
            case "image/bmp":
                return Option.apply("42".equalsIgnoreCase(Integer.toHexString((int) bytes[0] & 0xFF))
                        && "4D".equalsIgnoreCase(Integer.toHexString((int) bytes[1] & 0xFF)));
            case "image/gif":
                return Option.apply("47".equalsIgnoreCase(Integer.toHexString((int) bytes[0] & 0xFF))
                        && "49".equalsIgnoreCase(Integer.toHexString((int) bytes[1] & 0xFF))
                        && "46".equalsIgnoreCase(Integer.toHexString((int) bytes[2] & 0xFF))
                        && "38".equalsIgnoreCase(Integer.toHexString((int) bytes[3] & 0xFF)));
            case "video/x-msvideo":
                return Option.apply("52".equalsIgnoreCase(Integer.toHexString((int) bytes[0] & 0xFF))
                        && "49".equalsIgnoreCase(Integer.toHexString((int) bytes[1] & 0xFF))
                        && "46".equalsIgnoreCase(Integer.toHexString((int) bytes[2] & 0xFF))
                        && "46".equalsIgnoreCase(Integer.toHexString((int) bytes[3] & 0xFF)));
        }
        return Option$.MODULE$.empty();
    }
}
