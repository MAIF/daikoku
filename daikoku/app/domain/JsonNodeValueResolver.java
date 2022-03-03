package domain;

import com.github.jknack.handlebars.ValueResolver;
import play.api.libs.json.*;
import scala.Tuple2;
import scala.collection.Seq;
import scala.xml.pull.ExceptionEvent;

import java.util.*;
import java.util.Map.Entry;

public enum JsonNodeValueResolver implements ValueResolver {

    /**
     * The singleton instance.
     */
    INSTANCE;

    @Override
    public Object resolve(final Object context, final String name) {
        Object value = null;
        if (context instanceof JsArray) {
            try {
                if (name.equals("length")) {
                    return ((JsArray) context).value().length();
                }
                int index = Integer.parseInt(name);
                value = resolve(((JsArray) context).value().apply(index));
            } catch (NumberFormatException ex) {
                // ignore undefined key and move on, see https://github.com/jknack/handlebars.java/pull/280
                value = null;
            }
        } else if (context instanceof JsObject) {
            try {
                value = resolve(((JsObject) context).value().apply(name));
            } catch(Exception ex) {
                value = null;
            }
        }
        return value == null ? UNRESOLVED : value;
    }

    @Override
    public Object resolve(final Object context) {
        if (context instanceof JsValue) {
            return resolve((JsValue) context);
        }
        return UNRESOLVED;
    }

    /**
     * Resolve a {@link JsObject} object to a primitive value.
     *
     * @param node A {@link JsObject} object.
     * @return A primitive value, json object, json array or null.
     */
    private static Object resolve(final JsValue node) {
        if (node instanceof JsBoolean) {
            return ((JsBoolean) node).value();
        }
        if (node instanceof JsNumber) {
            return ((JsNumber) node).value();
        }
        if (node instanceof JsString) {
            return ((JsString) node).value();
        }
        // object node to map
        if (node instanceof JsObject) {
            return toMap((JsObject) node);
        }
        // container, array or null
        return node;
    }

    /**
     * @param node A json node.
     * @return A map from a json node.
     */
    private static Map<String, Object> toMap(final JsObject node) {
        return new AbstractMap<>() {
            @Override
            public Object get(final Object key) {
                return resolve(node.value().apply((String) key));
            }

            @Override
            public int size() {
                return node.fields().length();
            }

            @SuppressWarnings({"unchecked", "rawtypes"})
            @Override
            public Set<Map.Entry<String, Object>> entrySet() {
                scala.collection.Map<String, JsValue> it = node.value();
                Set set = new LinkedHashSet();
                it.foreachEntry((k, v) -> set.add(new SimpleEntry<String, Object>(k, v)));
                return set;
            }
        };
    }

    @Override
    public Set<Entry<String, Object>> propertySet(final Object context) {
        if (context instanceof JsObject) {
            JsObject node = (JsObject) context;
            Map<String, Object> result = new LinkedHashMap<String, Object>();

            Seq<Tuple2<String, JsValue>> fieldNames = node.fields();

            fieldNames.foreach(k -> result.put(k._1, resolve(node, k._1)));
            return result.entrySet();
        }
        return Collections.emptySet();
    }

}
