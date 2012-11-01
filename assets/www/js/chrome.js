window.chrome = function() {

	// Request that is currently causing the spinner to spin
	var curSpinningReq = null;

	// List of functions to be called on a per-platform basis before initialize
	var platform_initializers = [];
	function addPlatformInitializer(fun) {
		platform_initializers.push(fun);
	}

	function setSpinningReq(req) {
		curSpinningReq = req;
		req.done(function() {
			curSpinningReq = null;
		}).fail(function() {
			curSpinningReq = null;
		});
		return req;
	}

	function showSpinner() {
		$('.titlebar .spinner').css({display:'block'});
		$('#search').addClass('inProgress');
		$('#clearSearch').css({height:0});
	}

	function hideSpinner() {
		$('#search').removeClass('inProgress');
		$('.titlebar .spinner').css({display:'none'});	
		$('#clearSearch').css({height:30});
	}

	function isSpinning() {
		return $('#search').hasClass('inProgress');
	}

	var curSiteCSSLang = null;
	function loadSiteCSS( lang ) {
		if( lang === curSiteCSSLang ) {
			return;
		}
		rl.requestSiteCSS( lang ).done( function( css ) {
			loadCSS( 'site-style', css );
			curSiteCSSLang = lang;
		} );
	}

	function loadCSS( name, css ) {
		$( '#' + name ).html( '<style>' + css + '</style>' );
	}

	function renderHtml(page) {
		loadSiteCSS( page.lang );
		$('base').attr('href', page.getCanonicalUrl());

		if(l10n.isLangRTL(page.lang)) {
			$("#main").attr('dir', 'rtl');
		} else {
			$("#main").attr('dir', 'ltr');
		}
		$("#main").html(page.toHtml());

		chrome.initContentLinkHandlers( $( "#main" ) );
		mw.mobileFrontend.references.init($("#main")[0], false, {animation: 'none', onClickReference: onClickReference});
		handleSectionExpansion();
	}

	function populateSection(sectionID) {
		var d = $.Deferred();
		var selector = "#content_" + sectionID;
		var $contentBlock = $(selector);
		if(!$contentBlock.data('populated')) {
			app.curPage.requestSectionHtml( sectionID ).done( function( sectionHtml ) {
				var $el = $( sectionHtml );
				$contentBlock.append( $el ).data( 'populated', true );
				chrome.initContentLinkHandlers( $el );
				mw.mobileFrontend.references.init( $contentBlock[0], false, { animation: 'none', onClickReference: onClickReference } );
				d.resolve();
			});
		} else {
			d.resolve();
		}
		return d;
	}

	function handleSectionExpansion() {
		$(".section_heading").click(function() {
			var sectionID = $(this).data('section-id');
			chrome.populateSection(sectionID).done(function() {
				mw.mobileFrontend.toggle.wm_toggle_section( sectionID );
				chrome.setupScrolling( "#content" );
			});
			return false;
		});
	}

	function showNotification(text) {
		alert(text);
	}

	function confirm(text) {
		var d = $.Deferred();

		navigator.notification.confirm(text, function(button) {
			d.resolve(button === 1); //Assumes first button is OK
		}, "");

		return d;
	}
	function initialize() {
		$.each(platform_initializers, function(index, fun) {
			fun();
		});
		// some reason the android browser is not recognizing the style=block when set in the CSS
		// it only seems to recognize the style when dynamically set here or when set inline...
		// the style needs to be explicitly set for logic used in the backButton handler
		$('#content').css('display', 'block');

		var lastSearchTimeout = null; // Handle for timeout last time a key was pressed

		preferencesDB.initializeDefaults(function() {
			/* Split language string about '-' */
			console.log('language is ' + preferencesDB.get('uiLanguage'));
			if(l10n.isLangRTL(preferencesDB.get('uiLanguage'))) {
				$("body").attr('dir', 'rtl');
			}

			app.setContentLanguage(preferencesDB.get('language'));

			// Do localization of the initial interface
			$(document).bind("mw-messages-ready", function() {
				$('#mainHeader, #menu').localize();
				updateMenuState();
				$("#page-footer-contributors").html(mw.message('page-contributors').plain());
				$("#page-footer-license").html(mw.message('page-license').plain());
				$("#show-page-history").click(function() {
					if(app.curPage) {
						chrome.openExternalLink(app.curPage.getHistoryUrl());
					}
					return false;
				});
				$("#show-license-page").click(function() {
					app.navigateTo(window.LICENSEPAGE, "en");
					return false;
				});
				savedPages.doMigration().done(function() {
					chrome.loadFirstPage().done(function() {
						$("#migrating-saved-pages-overlay").hide();
					});
				}).fail(function() {
					navigator.notification.alert(mw.msg('migrating-saved-pages-failed'), function() {
						$("#migrating-saved-pages-overlay").hide();
					});
					chrome.loadFirstPage();
				});
			});
			l10n.initLanguages();

			toggleMoveActions();

			$(".titlebarIcon").bind('click', function() {
				app.loadMainPage();
				return false;
			});
			$("#searchForm").bind('submit', function() {
				if(isSpinning()) {
					if(curSpinningReq !== null) {
						curSpinningReq.abort();
						curSpinningReq = null;
						chrome.hideSpinner();
					}
				} else {
					search.performSearch($("#searchParam").val(), false);
				}
				return false;
			}).bind('keypress', function(event) {
				if(event.keyCode == 13)
				{
					$("#searchParam").blur();
				}else{
					// Wait 300ms with no keypress before starting request
					window.clearTimeout(lastSearchTimeout);
					lastSearchTimeout = setTimeout(function() {
						window.search.performSearch($("#searchParam").val(), true);
					}, 300);
				}
			});
			$("#searchParam").click(function() {
				$(this).focus(); // Seems to be needed to actually focus on the search bar
				// Caused by the FastClick implementation
			});
			$("#clearSearch").bind('touchstart', function() {
				clearSearch();
				return false;
			});

			$(".closeButton").bind('click', showContent);
			// Initialize Reference reveal with empty content
			mw.mobileFrontend.references.init($("#content")[0], true, {onClickReference: onClickReference} );

			app.setFontSize(preferencesDB.get('fontSize'));
			app.setTheme( preferencesDB.get( 'theme' ) );

			handleHeaderTimeout();
		});

	}

	// Bind to links inside reference reveal, handle them properly
	function onClickReference() {
		chrome.initContentLinkHandlers( $( "#mf-references" ) );
		if(l10n.isLangRTL(app.curPage.lang)) {
			$( "#mf-references" ).attr('dir', 'rtl');
		} else {
			$( "#mf-references" ).attr('dir', 'ltr');
		}
	}

	function loadFirstPage() {
		return app.loadMainPage();
	}

	var headerTimeout;
	var HEADER_TIMEOUT_INTERVAL = 10 * 1000; // Timeout before the header disappears
	function handleHeaderTimeout() {
		var $header = $( '#titlebar' );

		function resetTimeout() {
			clearTimeout( headerTimeout );
			headerTimeout = setTimeout( hideHeader, HEADER_TIMEOUT_INTERVAL );
		}

		function showHeader() {
			$header.removeClass( 'fadeOut' );
			resetTimeout();
		}

		function hideHeader() {
			if( $header.is( ':visible' ) &&
					$( window ).scrollTop() > 48  &&  // Leave no awkward whitespace on top!
					!$( '#search' ).hasClass( 'inProgress' ) && // Not if the spinner is spinning, no!
					app.curPage != null ) { // Only if we have an actively visible non-error page
				$header.addClass( 'fadeOut' );

			}
		}


		$( 'body' ).on( 'touchstart touchmove touchdown', resetTimeout );
		$( 'body' ).click( showHeader );
		$( window ).scroll( function() {
			if( $( window ).scrollTop() < 48 * 2 ) {
				showHeader();
			}
		} );
		headerTimeout = setTimeout( hideHeader, HEADER_TIMEOUT_INTERVAL );

		chrome.showHeader = showHeader;
		chrome.hideHeader = hideHeader;
	}

	function isTwoColumnView() {
		// should match the CSS media queries
		// check for goodscroll is so we don't use it on Android 2.x tablets
		return (document.width >= 640) && $('html').hasClass('goodscroll');
	}

	function hideOverlays() {
		$('#savedPages').hide();
		$('#history').hide();
		$('#searchresults').hide();
		$('#settings').hide();
		$('#about-page-overlay').hide();
		$('#langlinks').hide();
		$('#nearby-overlay').hide();
		$('html').removeClass('overlay-open');
	}

	function showContent() {
		hideOverlays();
		$('#mainHeader').show();
		$('#content').show();
		$("#menu").show();
	}

	function hideContent() {
		$('#mainHeader').hide();
		if(!isTwoColumnView()) {
			$('#content').hide();
			$("#menu").hide();
		} else {
			$('html').addClass('overlay-open');
		}
	}

	function popupErrorMessage(xhr) {
		if(xhr === "error") {
			navigator.notification.alert(mw.message('error-offline-prompt').plain());
		} else {
			navigator.notification.alert(mw.message('error-server-issue-prompt').plain());
		}
	}

	function toggleMoveActions() {
		var canGoForward = currentHistoryIndex < (pageHistory.length -1);
		var canGoBackward = currentHistoryIndex > 0;

		setMenuItemState('go-forward', canGoForward, true);
		setMenuItemState('go-back', canGoBackward, true);
	}

	function goBack() {
		console.log('currentHistoryIndex '+currentHistoryIndex + ' history length '+pageHistory.length);

		if ($('#content').css('display') == "block") {
			// We're showing the main view
			currentHistoryIndex -= 1;
			chrome.showSpinner();
			// Jumping through history is unsafe with the current urlCache system
			// sometimes we get loaded without the fixups, and everything esplodes.
			//window.history.go(-1);
			if(currentHistoryIndex < 0) {
				console.log("no more history to browse exiting...");
				navigator.app.exitApp();
			} else {
				console.log('going back to item ' + currentHistoryIndex + ': ' + pageHistory[currentHistoryIndex]);
				app.navigateToPage(pageHistory[currentHistoryIndex], {
					updateHistory: false
				});
			}
		} else {
			// We're showing one of the overlays; cancel out of it.
			showContent();
		}
	}

	function goForward() {
		chrome.showSpinner();
		console.log(pageHistory.length);
		console.log(currentHistoryIndex);
		if (currentHistoryIndex < pageHistory.length - 1) {
			app.navigateToPage(pageHistory[++currentHistoryIndex], {
				updateHistory: false
			});
		} else {
			chrome.hideSpinner();
			toggleMoveActions();
		}
	}

	function setupFastClick(selector) {
		$(selector).each(function(i, el) {
			var $el = $(el);
			if($el.data('fastclick')) {
				return;
			} else {
				$el.data('fastclick', new NoClickDelay($el[0]));
			}
		});
	}

	function initContentLinkHandlers( $element ) {
		$element.find( 'a' ).unbind( 'click' ).bind( 'click', function( event ) {
			var target = this,
				url = target.href,             // expanded from relative links for us
				href = $(target).attr('href'); // unexpanded, may be relative

			event.preventDefault();
			if (url.match(new RegExp("^https?://([^/]+)\." + PROJECTNAME + "\.org/wiki/"))) {
				// ...and load it through our intermediate cache layer.
				app.navigateToPage(url);
			} else {
				// ...and open it in parent context for reals.
				chrome.openExternalLink(url);
			}
			chrome.showHeader();
		});
	}
	
	function setupScrolling(selector) {
		// Setup iScroll4 in iOS 4.x. 
		// NOOP otherwise
	}

	function scrollTo(selector, posY) {
		$(selector).scrollTop(posY);
	}

	function openExternalLink(url) {
		// This seems to successfully launch the native browser, and works
		// both with the stock browser and Firefox as user's default browser
		//document.location = url;
		window.open(url);
	}

	return {
		initialize: initialize,
		renderHtml: renderHtml,
		loadFirstPage: loadFirstPage,
		setSpinningReq: setSpinningReq,
		showSpinner: showSpinner,
		hideSpinner: hideSpinner,
		isSpinning: isSpinning,
		showNotification: showNotification,
		goBack: goBack,
		goForward: goForward,
		hideOverlays: hideOverlays,
		showContent: showContent,
		hideContent: hideContent,
		addPlatformInitializer: addPlatformInitializer,
		popupErrorMessage: popupErrorMessage,
		setupFastClick: setupFastClick,
		isTwoColumnView: isTwoColumnView,
		openExternalLink: openExternalLink,
		toggleMoveActions: toggleMoveActions,
		confirm: confirm,
		setupScrolling: setupScrolling,
		scrollTo: scrollTo,
		populateSection: populateSection,
		initContentLinkHandlers: initContentLinkHandlers,
		showHeader: null, // initialized inside handleHeaderTimeout
		hideHeader: null,  // initialized inside handleHeaderTimeout
		loadCSS: loadCSS
	};
}();
