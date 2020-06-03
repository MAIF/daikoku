package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.domain.TeamPermission._
import fr.maif.otoroshi.daikoku.domain.UsagePlan._
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.{DaikokuMode, Env}
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.StringImplicits._
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import play.api.libs.json._
import play.api.mvc._
import reactivemongo.bson.BSONObjectID

import scala.concurrent.Future

class MockController(DaikokuAction: DaikokuAction,
                     env: Env,
                     cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext

  val scalaCode =
    """```scala
      |import zio.App
      |import zio.console._
      |
      |object MyApp extends App {
      |
      |  def run(args: List[String]) =
      |    myAppLogic.fold(_ => 1, _ => 0)
      |
      |  val myAppLogic =
      |    for {
      |      _    <- putStrLn("Hello! What is your name?")
      |      name <- getStrLn
      |      _    <- putStrLn(s"Hello, ${name}, welcome to ZIO!")
      |    } yield ()
      |}
      |```
    """.stripMargin

  def saveApiDocPages(tenant: TenantId): Future[Seq[ApiDocumentationPageId]] = {
    val id1 = ApiDocumentationPageId(BSONObjectID.generate().stringify)
    val id2 = ApiDocumentationPageId(BSONObjectID.generate().stringify)
    val id21 = ApiDocumentationPageId(BSONObjectID.generate().stringify)
    val id3 = ApiDocumentationPageId(BSONObjectID.generate().stringify)
    val id4 = ApiDocumentationPageId(BSONObjectID.generate().stringify)
    for {
      apiDocRepos <- env.dataStore.apiDocumentationPageRepo.forTenantF(tenant)
      _ <- apiDocRepos.save(
        ApiDocumentationPage(
          id = id1,
          tenant = tenant,
          // api = api,
          title = "Introduction",
          lastModificationAt = DateTime.now(),
          content =
            "# Introduction\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. \n\n@@@ note \nHello World\n@@@\n\nDuis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus"
        )
      )
      _ <- apiDocRepos.save(
        ApiDocumentationPage(
          id = id2,
          tenant = tenant,
          // api = api,
          title = "Do This",
          lastModificationAt = DateTime.now(),
          content =
            s"# Do This\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor,\n\n* abc\n* def\n* hij\n\na aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. \n\n$scalaCode\n\nDonec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus"
        )
      )
      _ <- apiDocRepos.save(
        ApiDocumentationPage(
          id = id21,
          tenant = tenant,
          // api = api,
          title = "and do it well",
          level = 1,
          lastModificationAt = DateTime.now(),
          content =
            s"# and do it well\n\nLorem ipsum dolor sit amet, \n\n@@@ warning { title='Achtung !!!' } \nHello World\n @@@ \n\nconsectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus"
        )
      )
      _ <- apiDocRepos.save(
        ApiDocumentationPage(
          id = id3,
          tenant = tenant,
          // api = api,
          title = "Do That",
          lastModificationAt = DateTime.now(),
          content =
            "# Do That\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. \n\n@@@ warning \nHello World\n@@@\n\n Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. \n\n* 123\n* 456\n* 789\n\nDonec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus"
        )
      )
      _ <- apiDocRepos.save(
        ApiDocumentationPage(
          id = id4,
          tenant = tenant,
          // api = api,
          title = "FAQ",
          lastModificationAt = DateTime.now(),
          content =
            "# FAQ\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in **pellentesque** justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus"
        )
      )
    } yield {
      Seq(id1, id2, id21, id3, id4)
    }
  }

  def SampleApi(id: String,
                tenant: TenantId,
                name: String,
                team: TeamId,
                docIds: Seq[ApiDocumentationPageId],
                visibility: ApiVisibility = ApiVisibility.Public) = Api(
    id = ApiId(BSONObjectID.generate().stringify),
    tenant = tenant,
    team = team,
    deleted = false,
    name = s"$name - $id",
    lastUpdate = DateTime.now(),
    smallDescription =
      s"$name to Lorem ipsum dolor sit amet, consectetur adipiscing elit",
    tags = Set("api", "rest", "java", "fun"),
    description = s"""# $name - $id
         |
        |Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus.
         |
        |Nullam augue risus, aliquam eu tortor eget, congue finibus turpis. Sed elementum leo a viverra consequat. Pellentesque quis enim eget nulla scelerisque aliquam vel vitae purus. Donec hendrerit, ligula at lobortis volutpat, est arcu fringilla turpis, sit amet varius quam justo nec velit. Suspendisse potenti. Praesent bibendum lobortis auctor. Morbi pellentesque, elit sit amet pellentesque efficitur, nunc purus consequat arcu, id posuere ex lacus nec magna. Pellentesque id porta ex, vitae egestas erat. Ut dignissim nisi vel ex tincidunt, at ornare nisi pretium. Phasellus euismod pretium sagittis. Nunc suscipit luctus ante, quis finibus mauris luctus at. Morbi id erat porta, tincidunt felis in, convallis mi. Aliquam erat volutpat. Suspendisse iaculis elementum enim at consectetur. Donec consequat dapibus dictum. Integer viverra bibendum dolor et hendrerit.
         |
        |```js
        |class HelloMessage extends React.Component {
        |  render() {
        |    return (
        |      <div>
        |        Hello {this.props.name}
        |      </div>
        |    );
        |  }
        |}
        |
        |ReactDOM.render(
        |  <HelloMessage name="Taylor" />,
        |  mountNode
        |);
        |```
        |
        |Donec iaculis, ligula et malesuada pharetra, ex magna lacinia purus, quis feugiat ante ante faucibus mi. Sed ut nulla mattis ligula bibendum commodo. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Duis sollicitudin maximus tempor. Sed a sagittis turpis. Aenean at elit pretium, porta neque ac, consectetur nisi. Pellentesque et justo ut nisl mollis tristique. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Vivamus lobortis tincidunt eros, at dapibus turpis tristique non. Proin rhoncus ut lacus nec pharetra. Nullam sit amet neque non nulla faucibus bibendum ac nec dui. Etiam nec nisi hendrerit, volutpat nibh nec, elementum diam. Integer vel lacinia nunc.
         |
        |Proin euismod metus ac consequat vestibulum. Nulla auctor euismod nunc, lacinia auctor augue posuere quis. Aenean nec arcu tellus. Sed quis felis dignissim, scelerisque nisi sed, volutpat arcu. Praesent eget risus suscipit, bibendum ante nec, dignissim libero. Sed eget dui vel lacus fringilla congue. Nulla vehicula tortor in venenatis dapibus. Nunc sed ante justo. Praesent eget ipsum tellus.
         |
        |Fusce ultricies at nisl sed faucibus. In sollicitudin libero eu augue lacinia aliquet. Nunc et eleifend augue. Donec eleifend nisi a iaculis tincidunt. Aenean a enim in nunc tincidunt euismod. Integer pellentesque tortor at ante tempus hendrerit. Fusce pretium, sapien ac sodales aliquam, diam quam placerat turpis, vitae tincidunt lacus massa finibus ante. Ut a ultrices odio. Sed pretium porttitor blandit. Sed ut ipsum a ligula pharetra lacinia. Donec laoreet purus mauris, rutrum hendrerit orci finibus at. Nullam aliquet augue ut tincidunt placerat. Proin tempor leo id orci tristique, at gravida metus pharetra.
      """.stripMargin,
    currentVersion = Version("1.0.0"),
    published = true,
    visibility = visibility,
    documentation = ApiDocumentation(
      id = ApiDocumentationId(BSONObjectID.generate().stringify),
      tenant = tenant,
      pages = docIds,
      lastModificationAt = DateTime.now()
    ),
    swagger = Some(SwaggerAccess("/assets/swaggers/petstore.json", None)),
    possibleUsagePlans = Seq(
      FreeWithoutQuotas(
        id = UsagePlanId("1"),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = None,
        allowMultipleKeys = Some(false),
        autoRotation = None,
        subscriptionProcess = SubscriptionProcess.Automatic,
        integrationProcess = IntegrationProcess.Automatic
      ),
      FreeWithQuotas(
        UsagePlanId("2"),
        2000,
        2000,
        2000,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = None,
        allowMultipleKeys = Some(false),
        autoRotation = None,
        subscriptionProcess = SubscriptionProcess.Automatic,
        integrationProcess = IntegrationProcess.Automatic
      ),
      QuotasWithLimits(
        id = UsagePlanId("3"),
        maxPerSecond = 10000,
        maxPerDay = 10000,
        maxPerMonth = 10000,
        costPerMonth = BigDecimal(10.0),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = None,
        allowMultipleKeys = Some(false),
        autoRotation = None,
        subscriptionProcess = SubscriptionProcess.Automatic,
        integrationProcess = IntegrationProcess.Automatic
      ),
      QuotasWithoutLimits(
        UsagePlanId("4"),
        10000,
        10000,
        10000,
        BigDecimal(0.015),
        BigDecimal(10.0),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = None,
        allowMultipleKeys = Some(false),
        autoRotation = None,
        subscriptionProcess = SubscriptionProcess.Automatic,
        integrationProcess = IntegrationProcess.Automatic
      ),
      PayPerUse(
        UsagePlanId("5"),
        BigDecimal(10.0),
        BigDecimal(0.02),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = None,
        allowMultipleKeys = Some(false),
        autoRotation = None,
        subscriptionProcess = SubscriptionProcess.Automatic,
        integrationProcess = IntegrationProcess.Automatic
      )
    ),
    defaultUsagePlan = UsagePlanId("1")
  )

  def ToyApi(version: String,
             tenant: TenantId,
             teamId: TeamId,
             docIds: Seq[ApiDocumentationPageId],
             authorizedTeams: Seq[TeamId] = Seq.empty) = Api(
    id = ApiId(s"my-toy-api-${tenant.value}-$version"),
    tenant = tenant,
    team = teamId,
    deleted = false,
    lastUpdate = DateTime.now(),
    name = s"My Toy Api - V$version",
    smallDescription = "A small API to play with Daikoku exposition",
    tags = Set("api", "rest", "scala", "play"),
    description =
      """# My Awesome API
        |
        |Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus.
        |
        |Nullam augue risus, aliquam eu tortor eget, congue finibus turpis. Sed elementum leo a viverra consequat. Pellentesque quis enim eget nulla scelerisque aliquam vel vitae purus. Donec hendrerit, ligula at lobortis volutpat, est arcu fringilla turpis, sit amet varius quam justo nec velit. Suspendisse potenti. Praesent bibendum lobortis auctor. Morbi pellentesque, elit sit amet pellentesque efficitur, nunc purus consequat arcu, id posuere ex lacus nec magna. Pellentesque id porta ex, vitae egestas erat. Ut dignissim nisi vel ex tincidunt, at ornare nisi pretium. Phasellus euismod pretium sagittis. Nunc suscipit luctus ante, quis finibus mauris luctus at. Morbi id erat porta, tincidunt felis in, convallis mi. Aliquam erat volutpat. Suspendisse iaculis elementum enim at consectetur. Donec consequat dapibus dictum. Integer viverra bibendum dolor et hendrerit.
        |
        |```js
        |class HelloMessage extends React.Component {
        |  render() {
        |    return (
        |      <div>
        |        Hello {this.props.name}
        |      </div>
        |    );
        |  }
        |}
        |
        |ReactDOM.render(
        |  <HelloMessage name="Taylor" />,
        |  mountNode
        |);
        |```
        |
        |Donec iaculis, ligula et malesuada pharetra, ex magna lacinia purus, quis feugiat ante ante faucibus mi. Sed ut nulla mattis ligula bibendum commodo. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Duis sollicitudin maximus tempor. Sed a sagittis turpis. Aenean at elit pretium, porta neque ac, consectetur nisi. Pellentesque et justo ut nisl mollis tristique. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Vivamus lobortis tincidunt eros, at dapibus turpis tristique non. Proin rhoncus ut lacus nec pharetra. Nullam sit amet neque non nulla faucibus bibendum ac nec dui. Etiam nec nisi hendrerit, volutpat nibh nec, elementum diam. Integer vel lacinia nunc.
        |
        |Proin euismod metus ac consequat vestibulum. Nulla auctor euismod nunc, lacinia auctor augue posuere quis. Aenean nec arcu tellus. Sed quis felis dignissim, scelerisque nisi sed, volutpat arcu. Praesent eget risus suscipit, bibendum ante nec, dignissim libero. Sed eget dui vel lacus fringilla congue. Nulla vehicula tortor in venenatis dapibus. Nunc sed ante justo. Praesent eget ipsum tellus.
        |
        |Fusce ultricies at nisl sed faucibus. In sollicitudin libero eu augue lacinia aliquet. Nunc et eleifend augue. Donec eleifend nisi a iaculis tincidunt. Aenean a enim in nunc tincidunt euismod. Integer pellentesque tortor at ante tempus hendrerit. Fusce pretium, sapien ac sodales aliquam, diam quam placerat turpis, vitae tincidunt lacus massa finibus ante. Ut a ultrices odio. Sed pretium porttitor blandit. Sed ut ipsum a ligula pharetra lacinia. Donec laoreet purus mauris, rutrum hendrerit orci finibus at. Nullam aliquet augue ut tincidunt placerat. Proin tempor leo id orci tristique, at gravida metus pharetra.
      """.stripMargin,
    currentVersion = Version("1.1.0"),
    supportedVersions = Set(Version("1.1.0"), Version("1.0.0")),
    published = true,
    visibility = ApiVisibility.Public,
    documentation = ApiDocumentation(
      id = ApiDocumentationId(BSONObjectID.generate().stringify),
      tenant = tenant,
      pages = docIds,
      lastModificationAt = DateTime.now(),
    ),
    swagger = Some(
      SwaggerAccess(url = "/assets/swaggers/petstore.json", content = None)),
    possibleUsagePlans = Seq(
      FreeWithoutQuotas(
        id = UsagePlanId("1"),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(OtoroshiSettingsId("default"),
                         OtoroshiServiceGroupId("12345"))
        ),
        allowMultipleKeys = Some(false),
        authorizedTeams = authorizedTeams,
        autoRotation = None,
        subscriptionProcess = SubscriptionProcess.Automatic,
        integrationProcess = IntegrationProcess.Automatic
      ),
      FreeWithQuotas(
        UsagePlanId("2"),
        2000,
        2000,
        2000,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(OtoroshiSettingsId("default"),
                         OtoroshiServiceGroupId("12345"))
        ),
        allowMultipleKeys = Some(false),
        authorizedTeams = authorizedTeams,
        autoRotation = None,
        subscriptionProcess = SubscriptionProcess.Automatic,
        integrationProcess = IntegrationProcess.Automatic
      ),
      QuotasWithLimits(
        UsagePlanId("3"),
        10000,
        10000,
        10000,
        BigDecimal(10.0),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(OtoroshiSettingsId("default"),
                         OtoroshiServiceGroupId("12345"))
        ),
        allowMultipleKeys = Some(false),
        authorizedTeams = authorizedTeams,
        autoRotation = None,
        subscriptionProcess = SubscriptionProcess.Automatic,
        integrationProcess = IntegrationProcess.Automatic
      ),
      QuotasWithoutLimits(
        UsagePlanId("4"),
        10000,
        10000,
        10000,
        BigDecimal(0.015),
        BigDecimal(10.0),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(OtoroshiSettingsId("default"),
                         OtoroshiServiceGroupId("12345"))
        ),
        allowMultipleKeys = Some(false),
        authorizedTeams = authorizedTeams,
        autoRotation = None,
        subscriptionProcess = SubscriptionProcess.Automatic,
        integrationProcess = IntegrationProcess.Automatic
      ),
      PayPerUse(
        UsagePlanId("5"),
        BigDecimal(10.0),
        BigDecimal(0.02),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(OtoroshiSettingsId("default"),
                         OtoroshiServiceGroupId("12345"))
        ),
        allowMultipleKeys = Some(false),
        authorizedTeams = authorizedTeams,
        autoRotation = None,
        subscriptionProcess = SubscriptionProcess.Automatic,
        integrationProcess = IntegrationProcess.Automatic
      )
    ),
    defaultUsagePlan = UsagePlanId("1")
  )

  def createUserAndTeam(name: String,
                        email: String,
                        tenantId: TenantId,
                        admin: Boolean = true): (User, Team) = {
    val userId = UserId(IdGenerator.token)
    val userWithPermission =
      if (admin) UserWithPermission(userId, TeamUser)
      else UserWithPermission(userId, Administrator)

    val team = Team(
      id = TeamId(IdGenerator.token),
      tenant = tenantId,
      `type` = TeamType.Personal,
      name = s"$name",
      description = s"The personal team of $name",
      avatar = Some(
        s"https://www.gravatar.com/avatar/${email.md5}?size=128&d=robohash"),
      users = Set(userWithPermission),
      subscriptions = Seq.empty,
      authorizedOtoroshiGroups = Set.empty
    )
    val user = User(
      id = userId,
      tenants = Set(tenantId),
      origins = Set(AuthProvider.Local),
      name = name,
      email = email,
      isDaikokuAdmin = admin,
      picture = email.gravatar,
      password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
      lastTenant = None,
      personalToken = Some(IdGenerator.token(32)),
      defaultLanguage = None
      // lastTeams = Map.empty
    )
    (user, team)
  }

  def reset() = Action.async { ctx =>
    env.config.mode match {
      case DaikokuMode.Dev => resetDataStore()
      case _ =>
        FastFuture.successful(
          BadRequest(Json.obj("error" -> "Action not avalaible")))
    }
  }

  def resetDataStore() = {
    val team1Id = BSONObjectID.generate().stringify
    val team2Id = BSONObjectID.generate().stringify
    val team3Id = BSONObjectID.generate().stringify
    val teamJohnnyId = BSONObjectID.generate().stringify
    val tenantId = Tenant.Default
    val tenant2Id = TenantId("tenant-2")
    val notifApiId = BSONObjectID.generate().stringify
    val notifApi = Api(
      id = ApiId(notifApiId),
      tenant = Tenant.Default,
      team = TeamId(team1Id),
      deleted = false,
      name = s"notif test api",
      lastUpdate = DateTime.now(),
      smallDescription =
        s"notification - to Lorem ipsum dolor sit amet, consectetur adipiscing elit",
      tags = Set("api", "rest", "java", "fun"),
      description = s"""# notification
             |
        |Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus.
             |
        |Nullam augue risus, aliquam eu tortor eget, congue finibus turpis. Sed elementum leo a viverra consequat. Pellentesque quis enim eget nulla scelerisque aliquam vel vitae purus. Donec hendrerit, ligula at lobortis volutpat, est arcu fringilla turpis, sit amet varius quam justo nec velit. Suspendisse potenti. Praesent bibendum lobortis auctor. Morbi pellentesque, elit sit amet pellentesque efficitur, nunc purus consequat arcu, id posuere ex lacus nec magna. Pellentesque id porta ex, vitae egestas erat. Ut dignissim nisi vel ex tincidunt, at ornare nisi pretium. Phasellus euismod pretium sagittis. Nunc suscipit luctus ante, quis finibus mauris luctus at. Morbi id erat porta, tincidunt felis in, convallis mi. Aliquam erat volutpat. Suspendisse iaculis elementum enim at consectetur. Donec consequat dapibus dictum. Integer viverra bibendum dolor et hendrerit.
             |
        |```js
             |class HelloMessage extends React.Component {
             |  render() {
             |    return (
             |      <div>
             |        Hello {this.props.name}
             |      </div>
             |    );
             |  }
             |}
             |
        |ReactDOM.render(
             |  <HelloMessage name="Taylor" />,
             |  mountNode
             |);
             |```
             |
        |Donec iaculis, ligula et malesuada pharetra, ex magna lacinia purus, quis feugiat ante ante faucibus mi. Sed ut nulla mattis ligula bibendum commodo. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Duis sollicitudin maximus tempor. Sed a sagittis turpis. Aenean at elit pretium, porta neque ac, consectetur nisi. Pellentesque et justo ut nisl mollis tristique. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Vivamus lobortis tincidunt eros, at dapibus turpis tristique non. Proin rhoncus ut lacus nec pharetra. Nullam sit amet neque non nulla faucibus bibendum ac nec dui. Etiam nec nisi hendrerit, volutpat nibh nec, elementum diam. Integer vel lacinia nunc.
             |
        |Proin euismod metus ac consequat vestibulum. Nulla auctor euismod nunc, lacinia auctor augue posuere quis. Aenean nec arcu tellus. Sed quis felis dignissim, scelerisque nisi sed, volutpat arcu. Praesent eget risus suscipit, bibendum ante nec, dignissim libero. Sed eget dui vel lacus fringilla congue. Nulla vehicula tortor in venenatis dapibus. Nunc sed ante justo. Praesent eget ipsum tellus.
             |
        |Fusce ultricies at nisl sed faucibus. In sollicitudin libero eu augue lacinia aliquet. Nunc et eleifend augue. Donec eleifend nisi a iaculis tincidunt. Aenean a enim in nunc tincidunt euismod. Integer pellentesque tortor at ante tempus hendrerit. Fusce pretium, sapien ac sodales aliquam, diam quam placerat turpis, vitae tincidunt lacus massa finibus ante. Ut a ultrices odio. Sed pretium porttitor blandit. Sed ut ipsum a ligula pharetra lacinia. Donec laoreet purus mauris, rutrum hendrerit orci finibus at. Nullam aliquet augue ut tincidunt placerat. Proin tempor leo id orci tristique, at gravida metus pharetra.
      """.stripMargin,
      currentVersion = Version("1.0.0"),
      published = true,
      visibility = ApiVisibility.PublicWithAuthorizations,
      documentation = ApiDocumentation(
        id = ApiDocumentationId(BSONObjectID.generate().stringify),
        tenant = Tenant.Default,
        pages = Seq.empty[ApiDocumentationPageId],
        lastModificationAt = DateTime.now()
      ),
      swagger = Some(SwaggerAccess("/assets/swaggers/petstore.json", None)),
      possibleUsagePlans = Seq(
        FreeWithoutQuotas(
          id = UsagePlanId("1"),
          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
          currency = Currency("EUR"),
          customName = None,
          customDescription = None,
          otoroshiTarget = None,
          allowMultipleKeys = Some(false),
          autoRotation = None,
          subscriptionProcess = SubscriptionProcess.Automatic,
          integrationProcess = IntegrationProcess.Automatic
        ),
        FreeWithQuotas(
          UsagePlanId("2"),
          2000,
          2000,
          2000,
          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
          currency = Currency("EUR"),
          customName = None,
          customDescription = None,
          otoroshiTarget = None,
          allowMultipleKeys = Some(false),
          autoRotation = None,
          subscriptionProcess = SubscriptionProcess.Automatic,
          integrationProcess = IntegrationProcess.Automatic
        ),
        QuotasWithLimits(
          id = UsagePlanId("3"),
          maxPerSecond = 10000,
          maxPerDay = 10000,
          maxPerMonth = 10000,
          costPerMonth = BigDecimal(10.0),
          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
          trialPeriod = None,
          currency = Currency("EUR"),
          customName = None,
          customDescription = None,
          otoroshiTarget = None,
          allowMultipleKeys = Some(false),
          autoRotation = None,
          subscriptionProcess = SubscriptionProcess.Automatic,
          integrationProcess = IntegrationProcess.Automatic
        ),
        QuotasWithoutLimits(
          UsagePlanId("4"),
          10000,
          10000,
          10000,
          BigDecimal(0.015),
          BigDecimal(10.0),
          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
          trialPeriod = None,
          currency = Currency("EUR"),
          customName = None,
          customDescription = None,
          otoroshiTarget = None,
          allowMultipleKeys = Some(false),
          autoRotation = None,
          subscriptionProcess = SubscriptionProcess.Automatic,
          integrationProcess = IntegrationProcess.Automatic
        ),
        PayPerUse(
          UsagePlanId("5"),
          BigDecimal(10.0),
          BigDecimal(0.02),
          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
          trialPeriod = None,
          currency = Currency("EUR"),
          customName = None,
          customDescription = None,
          otoroshiTarget = None,
          allowMultipleKeys = Some(false),
          autoRotation = None,
          subscriptionProcess = SubscriptionProcess.Automatic,
          integrationProcess = IntegrationProcess.Automatic
        )
      ),
      defaultUsagePlan = UsagePlanId("1"),
      authorizedTeams = Seq(TeamId(team1Id))
    )

    val (user1, userTeam1) =
      createUserAndTeam("Mathieu", "mathieu@foo.bar", tenantId)
    val (user2, userTeam2) =
      createUserAndTeam("Quentin", "quentin@foo.bar", tenantId)
    val (user3, userTeam3) =
      createUserAndTeam("Tester", "tester@foo.bar", tenantId)
    val (user4, userTeam4) =
      createUserAndTeam("philippe", "philippe@foo.bar", tenantId)
    val (user5, userTeam5) =
      createUserAndTeam("fifou", "fifou@foo.bar", tenantId, false)

    val defaultAdminTeam = Team(
      id = TeamId(IdGenerator.token),
      tenant = Tenant.Default,
      `type` = TeamType.Admin,
      name = s"default-admin-team",
      description = s"The admin team for the default tenant",
      avatar = Some(
        s"https://www.gravatar.com/avatar/${"default-tenant".md5}?size=128&d=robohash"),
      users = Set(
        UserWithPermission(user1.id, TeamPermission.Administrator),
        UserWithPermission(user2.id, TeamPermission.Administrator),
        UserWithPermission(user3.id, TeamPermission.Administrator),
        UserWithPermission(user4.id, TeamPermission.Administrator)),
      subscriptions = Seq.empty,
      authorizedOtoroshiGroups = Set.empty
    )
    val tenant2adminTeam = defaultAdminTeam.copy(
      id = TeamId(IdGenerator.token),
      tenant = tenant2Id,
      name = s"Johnny-be-good-admin-team",
      description = s"The admin team for the Johnny be good tenant",
      avatar = Some(
        s"https://www.gravatar.com/avatar/${"Johnny-be-good".md5}?size=128&d=robohash"),
    )

    val sender = user5

    val adminApiDefaultTenant = Api(
      id = ApiId(s"admin-api-tenant-${Tenant.Default.value}"),
      tenant = Tenant.Default,
      team = defaultAdminTeam.id,
      name = s"admin-api-tenant-${Tenant.Default.value}",
      lastUpdate = DateTime.now(),
      smallDescription = "admin api",
      description = "admin api",
      currentVersion = Version("1.0.0"),
      published = true,
      documentation = ApiDocumentation(
        id = ApiDocumentationId(BSONObjectID.generate().stringify),
        tenant = Tenant.Default,
        pages = Seq.empty[ApiDocumentationPageId],
        lastModificationAt = DateTime.now()
      ),
      swagger = None,
      possibleUsagePlans = Seq(
        Admin(
          id = UsagePlanId("admin"),
          customName = Some("admin"),
          customDescription = None,
          otoroshiTarget = None
        )
      ),
      tags = Set("Administration"),
      visibility = ApiVisibility.AdminOnly,
      defaultUsagePlan = UsagePlanId("1"),
      authorizedTeams = Seq.empty
    )
    val adminApiTenant2 = adminApiDefaultTenant.copy(
      id = ApiId(s"admin-api-tenant-${tenant2Id.value}"),
      tenant = tenant2Id,
      name = s"admin-api-tenant-${tenant2Id.value}",
      team = tenant2adminTeam.id,
      tags = Set("Administration"),
      documentation = ApiDocumentation(
        id = ApiDocumentationId(BSONObjectID.generate().stringify),
        tenant = tenant2Id,
        pages = Seq.empty[ApiDocumentationPageId],
        lastModificationAt = DateTime.now()
      ),
    )

    for {
      teamRepo1 <- env.dataStore.teamRepo.forTenantF(tenantId)
      teamRepo2 <- env.dataStore.teamRepo.forTenantF(tenant2Id)
      apiRepo <- env.dataStore.apiRepo.forTenantF(tenantId)
      apiRepo2 <- env.dataStore.apiRepo.forTenantF(tenant2Id)
      apiSubscriptionRepo <- env.dataStore.apiSubscriptionRepo
        .forTenantF(tenantId)
      apiDocumentationPageRepo <- env.dataStore.apiDocumentationPageRepo
        .forTenantF(tenantId)
      notificationRepo <- env.dataStore.notificationRepo.forTenantF(tenantId)
      consumptionRepo <- env.dataStore.consumptionRepo.forTenantF(tenantId)
      _ <- env.dataStore.tenantRepo.deleteAll()
      _ <- env.dataStore.userRepo.deleteAll()
      _ <- env.dataStore.auditTrailRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.userSessionRepo.deleteAll()
      _ <- env.dataStore.teamRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.apiRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.apiSubscriptionRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.apiDocumentationPageRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.notificationRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.consumptionRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.tenantRepo.save(
        Tenant(
          id = Tenant.Default,
          deleted = false,
          enabled = true,
          name = "Evil Corp.",
          domain = "localhost",
          defaultLanguage = Some("En"),
          style = Some(
            DaikokuStyle(
              title = "Evil Corp."
            )),
          contact = "contact@foo.bar",
          mailerSettings = Some(ConsoleMailerSettings()),
          authProvider = AuthProvider.Local,
          authProviderSettings = Json.obj(
            "sessionMaxAge" -> 86400
          ),
          bucketSettings = None,
          otoroshiSettings = Set(
            OtoroshiSettings(
              id = OtoroshiSettingsId("default"),
              url = s"http://127.0.0.1:${env.config.port}/fakeotoroshi",
              host = "otoroshi-api.foo.bar",
              clientId = "admin-api-apikey-id",
              clientSecret = "admin-api-apikey-id"
            )
          ),
          adminApi = adminApiDefaultTenant.id
        )
      )
      _ <- env.dataStore.tenantRepo.save(
        Tenant(
          id = tenant2Id,
          deleted = false,
          enabled = true,
          name = "Johnny be good",
          domain = "localhost",
          defaultLanguage = Some("fr"),
          contact = "contact@foo.bar",
          style = Some(
            DaikokuStyle(
              title = "North American Johnny Look Alike Association",
              description = "On a tous en nous quelque chose de Johnny",
              logo = "https://i.ytimg.com/vi/a2DMlY8f1IE/hqdefault.jpg",
              js = """<script>
                |  console.log('Allumez le feu !!!')
                |</script>
              """.stripMargin,
              css = """body {
              |}
              |
              |.user-logo {
              |  background-color: white;
              |}
              |
              |a {
              |  color: #111;
              |}
              |
              |button {
              |  background-color: #fff;
              |}
              |
              |a:hover, .btn:hover, .btn:focus {
              |  color: #111;
              |}
              |
              |.modal-content .btn:hover, .modal-content .btn:focus {
              |  color: #fff;
              |}
              |
              |main {
              |  background-color: #fff;
              |}
              |
              |main .jumbotron {
              |  background-color: #fff;
              |}
              |
              |.btn-outline-primary:hover, .btn-outline-danger:hover, .btn-outline-success:hover {
              |  color: #fff;
              |}
              |
              |/* btns */
              |.btn-access {
              |  color: #fff;
              |  background-color: #333;
              |  border-color: #333;
              |}
              |
              |.btn-access:hover {
              |  color: #fff;
              |  background-color: #111;
              |}
              |
              |.btn-access-negative {
              |  color: #495057;
              |  border-color: #333;
              |  background-color: #fff;
              |}
              |
              |/* cards */
              |.card-header {
              |  color: #eceeef;
              |}
              |
              |.cardAble .card-header {
              |  background-color: #666;
              |}
              |
              |.cardDisable .card-header {
              |  background-color: #555;
              |}
              |
              |.cardDisable a:hover, .cardAble a:hover {
              |  color: #6c757d;
              |}
              |
              |.cardDisable a, .cardAble a {
              |  color: #6c757d;
              |}
              |
              |.card-skin {
              |  color: rgb(32, 37, 41);
              |  background-color: rgb(231, 236, 239);
              |}
              |
              |a.nav-link.active {
              |  background-color: rgb(233, 236, 239);
              |}
              |
              |.doc-title {
              |  color: #343a40;
              |}
              |
              |.doc-title>a:hover, .doc-title>a:visited, .doc-title>a:link, .doc-title>a:active {
              |  color: #343a40;
              |}
              |
              |.home-tiles>a:hover, .home-tiles>a:visited, .home-tiles>a:link, .home-tiles>a:active {
              |  color: #343a40;
              |}
              |
              |.home-tile{
              |  background-color: #ccc;
              |}
              |
              |.sidebar .nav-link {
              |  color: #333;
              |}
              |
              |.sidebar .nav-link svg {
              |  color: #999;
              |}
              |
              |.sidebar .nav-link.active {
              |  color: #555;
              |}
              |
              |a.navbar-brand, #teamSelector:hover {
              |  color: #fff;
              |}
              |
              |.album, .navbar {
              |  background-color: #111;
              |}
              |
              |.sidebar .nav-link.active .nav-icon {
              |  fill: #555;
              |}
              |
              |.dropdown-menu {
              |  background-color: #f8f9fa;
              |}
              |
              |.dropdown-item:hover {
              |  background-color: #9bb0c5;
              |  color: #fff
              |}
              |
              |.note {
              |  border-left: 10px solid #555;
              |  background-color: rgba(64, 120, 192, 0.1);
              |  color: #0a0a0a;
              |}
              |
              |.note-warning {
              |  border-color: #DB504A;
              |  background-color: #fff3d9;
              |}
              |
              |/* notification */
              |.notification-link {
              |  color: #6c757d;
              |}
              |
              |.notification-link:hover {
              |  color: #5a6268;
              |}
              |
              |.unread-notifications::before {
              |  background-color: tomato;
              |  border: 2px solid #111;
              |}
              |
              |.notification-prop a:hover {
              |  color: #fff;
              |}
              |
              |.bg-api-detail {
              |  background-color: #e9ecef;
              |}
              |
              |.navDocumentation li::before {
              |  color: #6c757d;
              |}
              |
              |.hr-apidescription {
              |  border-bottom: 1px solid #BBBBBB;
              |}
              |
              |/* modal */
              |.modal-header{
              |  background-color: #111;
              |}
              |.modal-body,.modal-footer{
              |  background-color: #333;
              |}
              |.modal-content{
              |  background-color: initial;
              |  color:#fff;
              |}
              |
              |.table-plan-name .planSelected {
              |  background-color: #343a40;
              |  color:#fff;
              |}
              |
              |/* rwd */
              |@media screen and (max-width: 540px) {
              |  .nav-tabs .nav-item {
              |    border: 1px solid #555;
              |  }
              |  .nav-tabs .nav-link.active, .nav-tabs .nav-item.show .nav-link {
              |    background-color: #e7ecef;
              |  }
              |}
            """.stripMargin
            )),
          mailerSettings = Some(ConsoleMailerSettings()),
          authProvider = AuthProvider.Local,
          authProviderSettings = Json.obj(
            "sessionMaxAge" -> 86400
          ),
          bucketSettings = None,
          otoroshiSettings = Set(
            OtoroshiSettings(
              id = OtoroshiSettingsId("default"),
              url = s"http://127.0.0.1:${env.config.port}/fakeotoroshi",
              host = "otoroshi-api.foo.bar",
              clientId = "admin-api-apikey-id",
              clientSecret = "admin-api-apikey-id"
            )
          ),
          adminApi = adminApiTenant2.id
        )
      )
      _ <- env.dataStore.apiRepo.forTenant(Tenant.Default).save(adminApiDefaultTenant)
      _ <- env.dataStore.apiRepo.forTenant(tenant2Id).save(adminApiTenant2)
      _ <- teamRepo1.save(
        Team(
          id = TeamId(team3Id),
          tenant = tenantId,
          `type` = TeamType.Organization,
          name = s"Opun Team",
          description = s"The team for Opun people",
          avatar = Some(
            s"https://www.gravatar.com/avatar/${"opun-team@otoroshi.io".md5}?size=128&d=robohash"),
          users = Set(
            UserWithPermission(user1.id, TeamUser),
            UserWithPermission(user2.id, TeamUser),
            UserWithPermission(user3.id, TeamUser),
            UserWithPermission(user4.id, TeamUser),
            UserWithPermission(user5.id, Administrator)
          ),
          subscriptions = Seq(ApiSubscriptionId("1"),
                              ApiSubscriptionId("2"),
                              ApiSubscriptionId("3"),
                              ApiSubscriptionId("4"),
                              ApiSubscriptionId("5")) ++ (1 to 10).map(
            version => ApiSubscriptionId(s"sub-$version"))
        )
      )
      _ <- teamRepo1.save(
        Team(
          id = TeamId(team1Id),
          tenant = tenantId,
          `type` = TeamType.Organization,
          name = s"Fifou's Team",
          description = s"The team for Fifou people",
          avatar = Some(
            s"https://www.gravatar.com/avatar/${"fifou-team@otoroshi.io".md5}?size=128&d=robohash"),
          users = Set(
            UserWithPermission(user1.id, Administrator),
            UserWithPermission(user2.id, Administrator),
            UserWithPermission(user3.id, Administrator),
            UserWithPermission(user4.id, Administrator),
            UserWithPermission(user5.id, ApiEditor)
          )
        )
      )
      _ <- teamRepo1.save(
        Team(
          id = TeamId(team2Id),
          tenant = tenantId,
          `type` = TeamType.Organization,
          name = s"Bobby's Team",
          description = s"The team for Bobby people",
          avatar = Some(
            s"https://www.gravatar.com/avatar/${"bobby-team@otoroshi.io".md5}?size=128&d=robohash"),
          users = Set(UserWithPermission(user5.id, Administrator))
        )
      )
      _ <- teamRepo2.save(
        Team(
          id = TeamId(teamJohnnyId),
          tenant = tenant2Id,
          `type` = TeamType.Organization,
          name = s"Johnny's Team",
          description = s"The team for Johnny's fans",
          avatar = Some(
            s"https://www.gravatar.com/avatar/${"johnny-team@otoroshi.io".md5}?size=128&d=robohash"),
          users = Set.empty
        )
      )
      _ <- env.dataStore.userRepo.save(user1)
      _ <- env.dataStore.userRepo.save(user2)
      _ <- env.dataStore.userRepo.save(user3)
      _ <- env.dataStore.userRepo.save(user4)
      _ <- env.dataStore.userRepo.save(user5)
      _ <- teamRepo1.save(userTeam1)
      _ <- teamRepo1.save(userTeam2)
      _ <- teamRepo1.save(userTeam3)
      _ <- teamRepo1.save(userTeam4)
      _ <- teamRepo1.save(userTeam5)
      _ <- teamRepo1.save(defaultAdminTeam)
      _ <- teamRepo1.save(tenant2adminTeam)
      ids <- saveApiDocPages(tenantId)
      ids2 <- saveApiDocPages(tenant2Id)
      _ <- Future.sequence(
        Seq(
          apiRepo.save(
            ToyApi("0", tenantId, TeamId(team1Id), ids, Seq(TeamId(team3Id)))),
          apiRepo2.save(ToyApi("0", tenant2Id, TeamId(teamJohnnyId), ids2)),
          apiRepo.save(
            SampleApi("1", tenantId, "Opun Api", TeamId(team1Id), ids)),
          apiRepo.save(
            SampleApi("2", tenantId, "Opun Api", TeamId(team1Id), ids)),
          apiRepo.save(
            SampleApi("3", tenantId, "Opun Api", TeamId(team1Id), ids)),
          apiRepo.save(
            SampleApi("4", tenantId, "Opun Api", TeamId(team1Id), ids)),
          apiRepo.save(
            SampleApi("1",
                      tenantId,
                      "Bobby Api",
                      TeamId(team2Id),
                      ids,
                      ApiVisibility.PublicWithAuthorizations)
          ),
          apiRepo.save(
            SampleApi("2",
                      tenantId,
                      "Bobby Api",
                      TeamId(team2Id),
                      ids,
                      ApiVisibility.PublicWithAuthorizations)
          ),
          apiRepo.save(
            SampleApi("3",
                      tenantId,
                      "Bobby Api",
                      TeamId(team2Id),
                      ids,
                      ApiVisibility.PublicWithAuthorizations)
          ),
          apiRepo.save(
            SampleApi("4",
                      tenantId,
                      "Bobby Api",
                      TeamId(team2Id),
                      ids,
                      ApiVisibility.PublicWithAuthorizations)
          ),
          apiRepo.save(
            SampleApi("1", tenantId, "Fifou Api", TeamId(team2Id), ids)),
          apiRepo.save(
            SampleApi("2", tenantId, "Fifou Api", TeamId(team2Id), ids)),
          apiRepo.save(
            SampleApi("3", tenantId, "Fifou Api", TeamId(team2Id), ids)),
          apiRepo.save(
            SampleApi("4", tenantId, "Fifou Api", TeamId(team2Id), ids))
        )
      )
      _ <- apiRepo.save(notifApi)
      _ <- Future.sequence(
        Seq(
          notificationRepo.save(
            SampleNotification(
              team1Id,
              sender,
              DateTime.now().minusDays(5),
              NotificationStatus.Rejected(DateTime.now().minusDays(5)),
              NotificationAction.TeamAccess(TeamId(team2Id))
            )
          ),
          notificationRepo.save(
            SampleNotification(
              team1Id,
              sender,
              DateTime.now().minusDays(4),
              NotificationStatus.Accepted(DateTime.now().minusDays(4)),
              NotificationAction.TeamAccess(TeamId(team2Id))
            )
          ),
          notificationRepo.save(
            SampleNotification(
              team1Id,
              sender,
              DateTime.now().minusDays(3),
              NotificationStatus.Rejected(DateTime.now().minusDays(3)),
              NotificationAction.TeamAccess(TeamId(team2Id))
            )
          ),
          notificationRepo.save(
            SampleNotification(
              team1Id,
              sender,
              DateTime.now().minusDays(3),
              NotificationStatus.Rejected(DateTime.now().minusDays(3)),
              NotificationAction.ApiAccess(ApiId(notifApiId), TeamId(team2Id))
            )
          ),
          notificationRepo.save(
            SampleNotification(
              team1Id,
              sender,
              DateTime.now().minusDays(3),
              NotificationStatus.Pending,
              NotificationAction.ApiAccess(ApiId(notifApiId), TeamId(team2Id))
            )
          )
        )
      )
      _ <- Future.sequence((1 to 10).map(version => {
        val subPlanId = UsagePlanId((math.round(math.random) + 4).toString)
        val apiSubscription = ApiSubscription(
          ApiSubscriptionId(s"sub-$version"),
          tenantId,
          apiKey = OtoroshiApiKey(
            clientName =
              "daikoku-api-key-My-Toy-Apy-Free-plan-opun-team-1551171770474",
            clientId = s"client-id-$version",
            clientSecret = "secret-free"),
          plan = subPlanId,
          createdAt = DateTime.now().minusWeeks(1),
          team = TeamId(team3Id),
          api = ApiId(s"my-toy-api-${tenantId.value}-$version"),
          by = user5.id,
          customName = None,
          rotation = None,
          integrationToken = s"token-$version"
        )
        val api = ToyApi(version.toString, tenantId, TeamId(team1Id), ids)
        val plan = api.possibleUsagePlans.filter(_.id == subPlanId).head

        apiRepo
          .save(api.copy(possibleUsagePlans = api.possibleUsagePlans.filterNot(
            _.id == subPlanId) :+ plan.addAutorizedTeam(TeamId(team3Id))))
          .map(_ => apiSubscriptionRepo.save(apiSubscription))
      }))
      _ <- Future.sequence(
        Seq(
          apiSubscriptionRepo.save(ApiSubscription(
            ApiSubscriptionId("1"),
            tenantId,
            apiKey = OtoroshiApiKey(
              clientName =
                "daikoku-api-key-My-Toy-Apy-Free-plan-opun-team-1551171770474",
              clientId = "client-free-id",
              clientSecret = "secret-free"),
            plan = UsagePlanId("1"),
            createdAt = DateTime.now().minusDays(5),
            team = TeamId(team3Id),
            api = ApiId(s"my-toy-api-${tenantId.value}-0"),
            by = user5.id,
            customName = None,
            rotation = None,
            integrationToken = "token-free"
          )),
          apiSubscriptionRepo.save(ApiSubscription(
            ApiSubscriptionId("2"),
            tenantId,
            apiKey = OtoroshiApiKey(
              clientName =
                "daikoku-api-key-my-toy-api-free-with-quota-opun-team-1551171774997",
              clientId = "client-free-quota-id",
              clientSecret = "secret-quota"),
            plan = UsagePlanId("2"),
            createdAt = DateTime.now().minusDays(5),
            team = TeamId(team3Id),
            api = ApiId(s"my-toy-api-${tenantId.value}-0"),
            by = user5.id,
            customName = None,
            rotation = None,
            integrationToken = "token-free-quota"
          )),
          apiSubscriptionRepo.save(ApiSubscription(
            ApiSubscriptionId("3"),
            tenantId,
            apiKey = OtoroshiApiKey(
              clientName =
                "daikoku-api-key-my-toy-api-quotas-with-limit-opun-team-1551171774997",
              clientId = "client-quota-only-id",
              clientSecret = "secret-quota"),
            plan = UsagePlanId("3"),
            createdAt = DateTime.now().minusDays(5),
            team = TeamId(team3Id),
            api = ApiId(s"my-toy-api-${tenantId.value}-0"),
            by = user5.id,
            customName = None,
            rotation = None,
            integrationToken = "token-quota-only"
          )),
          apiSubscriptionRepo.save(ApiSubscription(
            ApiSubscriptionId("4"),
            tenantId,
            apiKey = OtoroshiApiKey(
              clientName =
                "daikoku-api-key-my-toy-api-quotas-without-limit-opun-team-1551171774997",
              clientId = "client-quota-without-limit-id",
              clientSecret = "secret-quota"
            ),
            plan = UsagePlanId("4"),
            createdAt = DateTime.now().minusDays(5),
            team = TeamId(team3Id),
            api = ApiId(s"my-toy-api-${tenantId.value}-0"),
            by = user5.id,
            customName = None,
            rotation = None,
            integrationToken = "token-quota-without-limit"
          )),
          apiSubscriptionRepo.save(ApiSubscription(
            ApiSubscriptionId("5"),
            tenantId,
            apiKey = OtoroshiApiKey(
              clientName =
                "daikoku-api-key-my-toy-api-pay-per-use-opun-team-1551171789193",
              clientId = "client-pay-per-use-id",
              clientSecret = "secret-pay-per-use"),
            plan = UsagePlanId("5"),
            createdAt = DateTime.now().minusDays(5),
            team = TeamId(team3Id),
            api = ApiId(s"my-toy-api-${tenantId.value}-0"),
            by = user5.id,
            customName = None,
            rotation = None,
            integrationToken = "token-pay-per-use"
          ))
        ))
    } yield {
      Ok(Json.obj("done" -> true))
    }
  }

  def SampleNotification(teamId: String,
                         sender: User,
                         date: DateTime,
                         status: NotificationStatus,
                         action: NotificationAction) =
    Notification(
      id = NotificationId(BSONObjectID.generate().stringify),
      tenant = Tenant.Default,
      team = Some(TeamId(teamId)),
      sender = sender,
      date = date,
      notificationType = NotificationType.AcceptOrReject,
      status = status,
      action = action
    )

  // client(s"/api/groups/$groupId")
  // client(s"/api/groups").get()
  // client(s"/api/groups/$groupId").get()
  // client(s"/api/groups/$groupId/apikeys/$clientId").get()
  // client(s"/api/groups/$groupId/apikeys").post
  // client(s"/api/groups/$groupId/apikeys/${key.clientId}").put
  // client(s"/api/groups/$groupId/apikeys/$clientId").delete().

  val groups: Seq[JsObject] = Seq(
    Json.obj(
      "id" -> "12345",
      "name" -> "nice-group",
      "description" -> "A nice group"
    ),
    Json.obj(
      "id" -> "12346",
      "name" -> "daikoku_nice-group",
      "description" -> "A nice group (with prefix)"
    )
  )
  var apikeys: Seq[JsObject] = Seq()

  def fakeOtoroshiGroups() = Action {
    Ok(JsArray(groups))
  }

  def fakeOtoroshiGroup(groupId: String) = Action {
    val found = groups.find { obj =>
      (obj \ "id").as[String] == groupId
    }
    found match {
      case Some(group) => Ok(group)
      case None        => NotFound(Json.obj("error" -> "not found"))
    }
  }

  def fakeOtoroshiApiKeys(groupId: String) = Action {
    Ok(JsArray(apikeys.filter(ak =>
      (ak \ "authorizedGroup").as[String] == groupId)))
  }

  def fakeOtoroshiApiKey(groupId: String, clientId: String) = Action {
    Ok(
      ActualOtoroshiApiKey(
        clientId = clientId,
        clientSecret = "",
        clientName = "",
        authorizedGroup = groupId,
        throttlingQuota = 10,
        dailyQuota = 10000,
        monthlyQuota = 300000,
        constrainedServicesOnly = true,
        tags = Seq(),
        restrictions = ApiKeyRestrictions(),
        metadata = Map(),
        rotation = None
      ).asJson)
  }

  def createFakeOtoroshiApiKey(groupId: String) = Action(parse.json) { req =>
    apikeys = apikeys :+ req.body.as[JsObject]
    Ok(req.body.as[JsObject])
  }

  def updateFakeOtoroshiApiKey(groupId: String, clientId: String) =
    Action(parse.json) { req =>
      json.ActualOtoroshiApiKeyFormat.reads(req.body).asOpt match {
        case Some(apiKey) => Ok(apiKey.asJson)
        case None         => BadRequest(Json.obj("error" -> "wrong apikey format"))
      }
    }

  def deleteFakeOtoroshiApiKey(groupId: String, clientId: String) =
    Action(parse.json) {
      Ok(Json.obj("deleted" -> true))
    }

  def fakeOtoroshiStats(from: String, to: String, apikey: String) =
    Action.async {
      val r = scala.util.Random

      env.dataStore.apiSubscriptionRepo
        .forAllTenant()
        .findOneNotDeleted(Json.obj("apiKey.clientId" -> apikey))
        .flatMap {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "subscription not found")))
          case Some(sub) =>
            env.dataStore.apiRepo
              .forAllTenant()
              .findByIdNotDeleted(sub.api)
              .map {
                case None => NotFound(Json.obj("error" -> "api not found"))
                case Some(api) =>
                  Ok(Json.obj("hits" -> Json.obj("count" -> r.nextInt(100))))
              }
        }
    }

  def fakeOtoroshiQuotas(groupId: String, clientId: String) = Action.async {
    val r = scala.util.Random

    env.dataStore.apiSubscriptionRepo
      .forAllTenant()
      .findOneNotDeleted(Json.obj("apiKey.clientId" -> clientId))
      .flatMap {
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "subscription not found")))
        case Some(sub) =>
          env.dataStore.apiRepo.forAllTenant().findByIdNotDeleted(sub.api).map {
            case None => NotFound(Json.obj("error" -> "api not found"))
            case Some(api) =>
              api.possibleUsagePlans
                .find(pp => pp.id == sub.plan)
                .map(
                  pp => {
                    val callPerSec =
                      r.nextInt(pp.maxRequestPerSecond.getOrElse(10L).toInt)
                    val callPerDay =
                      r.nextInt(pp.maxRequestPerDay.getOrElse(100L).toInt)
                    val callPerMonth =
                      r.nextInt(pp.maxRequestPerMonth.getOrElse(1000L).toInt)

                    Ok(ApiKeyQuotas(
                      authorizedCallsPerSec =
                        pp.maxRequestPerSecond.getOrElse(0),
                      currentCallsPerSec = callPerSec,
                      remainingCallsPerSec = pp.maxRequestPerSecond.getOrElse(
                        0L) - callPerSec,
                      authorizedCallsPerDay = pp.maxRequestPerDay.getOrElse(0),
                      currentCallsPerDay = callPerDay,
                      remainingCallsPerDay = pp.maxRequestPerDay
                        .getOrElse(0L) - callPerDay,
                      authorizedCallsPerMonth =
                        pp.maxRequestPerMonth.getOrElse(0),
                      currentCallsPerMonth = callPerMonth,
                      remainingCallsPerMonth = pp.maxRequestPerMonth.getOrElse(
                        0L) - callPerMonth,
                    ).asJson)
                  }
                )
                .getOrElse(NotFound(Json.obj("error" -> "plan not found")))
          }
      }
  }
}
