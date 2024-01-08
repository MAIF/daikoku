package fr.maif.otoroshi.daikoku.utils

import java.util.regex.Pattern.CASE_INSENSITIVE
import java.util.regex.{MatchResult, Matcher, Pattern}

object ReplaceAllWith {
  def apply(regex: String): ReplaceAllWith = new ReplaceAllWith(regex)
}

class ReplaceAllWith(regex: String) {

  val pattern: Pattern = Pattern.compile(regex, CASE_INSENSITIVE)

  def replaceOn(value: String)(callback: String => String): String = {
    var str: String = value
    val matcher: Matcher = pattern.matcher(str)
    while (matcher.find()) {
      val matchResult: MatchResult = matcher.toMatchResult
      val expression: String = matchResult.group().substring(2).init
      val replacement: String = callback(expression)
      str = str.substring(0, matchResult.start) + replacement + str.substring(
        matchResult.end
      )
      matcher.reset(str)
    }
    str
  }
}
