import EmberObject, { action } from "@ember/object";
import cookie, { removeCookie } from "discourse/lib/cookie";
import Component from "@ember/component";
import I18n from "I18n";
import discourseComputed, { bind } from "discourse-common/utils/decorators";
import { htmlSafe } from "@ember/template";
import { inject as service } from "@ember/service";
import { tagName } from "@ember-decorators/component";

const _pluginNotices = [];

export function addGlobalNotice(text, id, options = {}) {
  _pluginNotices.push(Notice.create({ text, id, options }));
}

const GLOBAL_NOTICE_DISMISSED_PROMPT_KEY = "dismissed-global-notice-v2";

const Notice = EmberObject.extend({
  logsNoticeService: service("logsNotice"),

  text: null,
  id: null,
  options: null,

  init() {
    this._super(...arguments);

    const defaults = {
      // can this banner be hidden
      dismissable: false,
      // prepend html content
      html: null,
      // will define the style of the banner, follows alerts styling
      level: "info",
      // should the banner be permanently hidden?
      persistentDismiss: true,
      // callback function when dismissing a banner
      onDismiss: null,
      // show/hide banner function, will take precedence over everything
      visibility: null,
      // how long before banner should show again, eg: moment.duration(1, "week")
      dismissDuration: null,
    };

    this.options = this.set(
      "options",
      Object.assign(defaults, this.options || {})
    );
  },
});

@tagName("")
export default class GlobalNotice extends Component {
  @service keyValueStore;
  @service("logsNotice") logsNoticeService;
  @service router;

  logNotice = null;

  constructor() {
    super(...arguments);

    this.logsNoticeService.addObserver("hidden", this._handleLogsNoticeUpdate);
    this.logsNoticeService.addObserver("text", this._handleLogsNoticeUpdate);
  }

  willDestroyElement() {
    super.willDestroyElement(...arguments);

    this.logsNoticeService.removeObserver("text", this._handleLogsNoticeUpdate);
    this.logsNoticeService.removeObserver(
      "hidden",
      this._handleLogsNoticeUpdate
    );
  }

  get visible() {
    return !this.router.currentRouteName.startsWith("wizard.");
  }

  @discourseComputed(
    "site.isReadOnly",
    "site.isStaffWritesOnly",
    "siteSettings.login_required",
    "siteSettings.disable_emails",
    "siteSettings.global_notice",
    "session.safe_mode",
    "logNotice.{id,text,hidden}"
  )
  notices(
    isReadOnly,
    isStaffWritesOnly,
    loginRequired,
    disableEmails,
    globalNotice,
    safeMode,
    logNotice
  ) {
    let notices = [];

    if (cookie("dosp") === "1") {
      removeCookie("dosp", { path: "/" });
      notices.push(
        Notice.create({
          text: loginRequired
            ? I18n.t("forced_anonymous_login_required")
            : I18n.t("forced_anonymous"),
          id: "forced-anonymous",
        })
      );
    }

    if (safeMode) {
      notices.push(
        Notice.create({ text: I18n.t("safe_mode.enabled"), id: "safe-mode" })
      );
    }

    if (isStaffWritesOnly) {
      notices.push(
        Notice.create({
          text: I18n.t("staff_writes_only_mode.enabled"),
          id: "alert-staff-writes-only",
        })
      );
    } else if (isReadOnly) {
      notices.push(
        Notice.create({
          text: I18n.t("read_only_mode.enabled"),
          id: "alert-read-only",
        })
      );
    }

    if (disableEmails === "yes") {
      notices.push(
        Notice.create({
          text: I18n.t("emails_are_disabled"),
          id: "alert-emails-disabled",
        })
      );
    } else if (disableEmails === "non-staff") {
      notices.push(
        Notice.create({
          text: I18n.t("emails_are_disabled_non_staff"),
          id: "alert-emails-disabled",
        })
      );
    }

    if (globalNotice?.length > 0) {
      notices.push(
        Notice.create({
          text: globalNotice,
          id: "alert-global-notice",
        })
      );
    }

    if (logNotice) {
      notices.push(logNotice);
    }

    return notices.concat(_pluginNotices).filter((notice) => {
      if (notice.options.visibility) {
        return notice.options.visibility(notice);
      }

      const key = `${GLOBAL_NOTICE_DISMISSED_PROMPT_KEY}-${notice.id}`;
      const value = this.keyValueStore.get(key);

      // banner has never been dismissed
      if (!value) {
        return true;
      }

      // banner has no persistent dismiss and should always show on load
      if (!notice.options.persistentDismiss) {
        return true;
      }

      if (notice.options.dismissDuration) {
        const resetAt = moment(value).add(notice.options.dismissDuration);
        return moment().isAfter(resetAt);
      } else {
        return false;
      }
    });
  }

  @action
  dismissNotice(notice) {
    notice.options.onDismiss?.(notice);

    if (notice.options.persistentDismiss) {
      this.keyValueStore.set({
        key: `${GLOBAL_NOTICE_DISMISSED_PROMPT_KEY}-${notice.id}`,
        value: moment().toISOString(true),
      });
    }

    const alert = document.getElementById(`global-notice-${notice.id}`);
    if (alert) {
      alert.style.display = "none";
    }
  }

  @bind
  _handleLogsNoticeUpdate() {
    const logNotice = Notice.create({
      text: htmlSafe(this.logsNoticeService.message),
      id: "alert-logs-notice",
      options: {
        dismissable: true,
        persistentDismiss: false,
        visibility: () => !this.logsNoticeService.hidden,
        onDismiss: () => this.logsNoticeService.set("text", ""),
      },
    });

    this.set("logNotice", logNotice);
  }
}
