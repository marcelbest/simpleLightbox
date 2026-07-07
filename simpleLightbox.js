/**
 * SimpleLightbox
 *
 * Lightweight lightbox for responsive image galleries.
 * Based on dbrekalo/simpleLightbox (MIT), modernized to ES6.
 * Pinch-to-zoom adapted from byronjohnson/litelight (MIT), Copyright (c) Byron Johnson.
 * Swipe navigation and SVG icon support added.
 *
 * Copyright (c) 2018 Damir Brekalo
 * @license MIT
 */

const MIN_ZOOM       = 1;
const MAX_ZOOM       = 5;
const ZOOM_TOLERANCE = 0.01;

function parseHtml( html ) {
    const div = document.createElement( 'div' );
    div.innerHTML = html.trim();
    return div.childNodes[ 0 ];
}

function btnContent( icon, caption ) {
    if ( icon ) {
        return '<span class="icon" aria-hidden="true">' + icon + '</span>';
    }
    return caption;
}

function isApproximatelyOne( value ) {
    return Math.abs( value - 1 ) < ZOOM_TOLERANCE;
}

function getTouchDistance( touches ) {
    const dx = touches[ 1 ].screenX - touches[ 0 ].screenX;
    const dy = touches[ 1 ].screenY - touches[ 0 ].screenY;
    return Math.sqrt( dx * dx + dy * dy );
}

function getTouchCenter( touches ) {
    return {
        x: ( touches[ 0 ].screenX + touches[ 1 ].screenX ) / 2,
        y: ( touches[ 0 ].screenY + touches[ 1 ].screenY ) / 2,
    };
}

const defaults = {

    // Custom classes
    elementClass:        '',
    elementLoadingClass: 'slbLoading',
    htmlClass:           'slbActive',
    closeBtnClass:       '',
    nextBtnClass:        '',
    prevBtnClass:        '',
    loadingTextClass:    '',

    // Captions / localization
    closeBtnCaption: 'Close',
    nextBtnCaption:  'Next',
    prevBtnCaption:  'Previous',
    loadingCaption:  'Loading...',

    // Icons (optional — HTML string, e.g. SVG; replaces button text when set)
    closeBtnIcon: '',
    nextBtnIcon:  '',
    prevBtnIcon:  '',

    // Behaviour
    bindToItems:         true,
    closeOnOverlayClick: true,
    closeOnEscapeKey:    true,
    nextOnImageClick:    true,
    showCaptions:        true,

    captionAttribute: 'title',
    urlAttribute:     'href',

    startAt:         0,
    loadingTimeout:  100,
    appendTarget:    'body',
    swipeThreshold:  50,

    // Hooks
    beforeSetContent: null,
    beforeClose:      null,
    afterClose:       null,
    beforeDestroy:    null,
    afterDestroy:     null,

    videoRegex: /youtube\.com|vimeo\.com/,

};

class SimpleLightbox {

    constructor( options ) {
        this.init( options );
    }

    init( options ) {
        this.options = Object.assign( {}, defaults, options );

        const { elements, $items, bindToItems, urlAttribute, captionAttribute } = this.options;

        this.eventRegistry = { lightbox: [], thumbnails: [] };
        this.items    = [];
        this.captions = [];

        this.zoomState  = { scale: 1, x: 0, y: 0, initialScale: 1, initialX: 0, initialY: 0 };
        this.touchState = { startX: 0, startY: 0, initialDistance: 0, isZooming: false, lastCenterX: 0, lastCenterY: 0 };
        this.rafPending = false;

        let items = [];

        if ( $items ) {
            items = $items.get();
        } else if ( elements ) {
            items = Array.from(
                typeof elements === 'string'
                    ? document.querySelectorAll( elements )
                    : elements
            );
        }

        items.forEach( ( element, index ) => {
            this.items.push( element.getAttribute( urlAttribute ) );
            this.captions.push( element.getAttribute( captionAttribute ) );

            if ( bindToItems ) {
                this.addEvent( element, 'click', ( e ) => {
                    e.preventDefault();
                    this._opener = element;
                    this.showPosition( index );
                }, 'thumbnails' );
            }
        } );

        if ( this.options.items )    { this.items    = this.options.items; }
        if ( this.options.captions ) { this.captions = this.options.captions; }
    }

    addEvent( element, eventName, callback, scope = 'lightbox', listenerOptions = {} ) {
        this.eventRegistry[ scope ].push( { element, eventName, callback } );
        element.addEventListener( eventName, callback, listenerOptions );
        return this;
    }

    removeEvents( scope ) {
        this.eventRegistry[ scope ].forEach( ( { element, eventName, callback } ) => {
            element.removeEventListener( eventName, callback );
        } );
        this.eventRegistry[ scope ] = [];
        return this;
    }

    next() {
        return this.showPosition( this.currentPosition + 1 );
    }

    prev() {
        return this.showPosition( this.currentPosition - 1 );
    }

    normalizePosition( position ) {
        if ( position >= this.items.length ) { return 0; }
        if ( position < 0 ) { return this.items.length - 1; }
        return position;
    }

    showPosition( position ) {
        const newPosition = this.normalizePosition( position );

        if ( typeof this.currentPosition !== 'undefined' ) {
            this.direction = newPosition > this.currentPosition ? 'next' : 'prev';
        }

        this.currentPosition = newPosition;
        this.resetZoom();

        return this.setupLightboxHtml()
            .prepareItem( this.currentPosition, this.setContent )
            .show();
    }

    loading( on ) {
        const { elementLoadingClass, loadingTextClass, loadingCaption, loadingTimeout } = this.options;

        if ( on ) {
            this.loadingTimeout = setTimeout( () => {
                this.$el.classList.add( elementLoadingClass );
                this.$content.innerHTML = `<p class="slbLoadingText ${ loadingTextClass }">${ loadingCaption }</p>`;
                this.show();
            }, loadingTimeout );
        } else {
            this.$el.classList.remove( elementLoadingClass );
            clearTimeout( this.loadingTimeout );
        }
    }

    prepareItem( position, callback ) {
        const url = this.items[ position ];

        this.loading( true );

        if ( this.options.videoRegex.test( url ) ) {

            callback.call( this, parseHtml(
                `<div class="slbIframeCont"><iframe class="slbIframe" frameborder="0" allowfullscreen src="${ url }"></iframe></div>`
            ) );

        } else {

            const $imageCont = parseHtml(
                `<div class="slbImageWrap"><img class="slbImage" src="${ url }" /></div>`
            );

            this.$currentImage = $imageCont.querySelector( '.slbImage' );

            if ( this.options.showCaptions && this.captions[ position ] ) {
                $imageCont.appendChild( parseHtml(
                    `<div class="slbCaption">${ this.captions[ position ] }</div>`
                ) );
            }

            this.loadImage( url, () => {
                this.setImageDimensions();
                callback.call( this, $imageCont );
                this.loadImage( this.items[ this.normalizePosition( this.currentPosition + 1 ) ] );
            } );

        }

        return this;
    }

    loadImage( url, callback ) {
        if ( ! this.options.videoRegex.test( url ) ) {
            const image = new Image();
            if ( callback ) { image.onload = callback; }
            image.src = url;
        }
    }

    setupLightboxHtml() {
        const o = this.options;

        if ( ! this.$el ) {
            const closeBtnClass = [ 'slbCloseBtn', o.closeBtnIcon ? 'slbHasIcon' : '', o.closeBtnClass ].filter( Boolean ).join( ' ' );
            const prevBtnClass  = [ 'prev slbArrow', o.prevBtnIcon ? 'slbHasIcon' : '', o.prevBtnClass ].filter( Boolean ).join( ' ' );
            const nextBtnClass  = [ 'next slbArrow', o.nextBtnIcon ? 'slbHasIcon' : '', o.nextBtnClass ].filter( Boolean ).join( ' ' );

            this.$el = parseHtml(
                `<div class="slbElement ${ o.elementClass }">` +
                    '<div class="slbOverlay"></div>' +
                    '<div class="slbWrapOuter">' +
                        '<div class="slbWrap">' +
                            '<div class="slbContentOuter">' +
                                '<div class="slbContent"></div>' +
                                `<button type="button" title="${ o.closeBtnCaption }" aria-label="${ o.closeBtnCaption }" class="${ closeBtnClass }">${ btnContent( o.closeBtnIcon, '×' ) }</button>` +
                                ( this.items.length > 1
                                    ? '<div class="slbArrows">' +
                                        `<button type="button" title="${ o.prevBtnCaption }" aria-label="${ o.prevBtnCaption }" class="${ prevBtnClass }">${ btnContent( o.prevBtnIcon, o.prevBtnCaption ) }</button>` +
                                        `<button type="button" title="${ o.nextBtnCaption }" aria-label="${ o.nextBtnCaption }" class="${ nextBtnClass }">${ btnContent( o.nextBtnIcon, o.nextBtnCaption ) }</button>` +
                                      '</div>'
                                    : ''
                                ) +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>'
            );

            this.$content = this.$el.querySelector( '.slbContent' );
        }

        return this;
    }

    show() {
        if ( ! this.modalInDom ) {
            this._scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

            document.body.style.overflow     = 'hidden';
            document.body.style.paddingRight = `${ this._scrollbarWidth }px`;

            document.querySelectorAll( '.fixed-top, .fixed-bottom, .sticky-top' ).forEach( ( el ) => {
                const current = parseFloat( getComputedStyle( el ).paddingRight ) || 0;
                el.dataset.slbPaddingRight = el.style.paddingRight;
                el.style.paddingRight = `${ current + this._scrollbarWidth }px`;
            } );

            document.querySelector( this.options.appendTarget ).appendChild( this.$el );
            document.documentElement.classList.add( this.options.htmlClass );
            this.setupLightboxEvents();
            this.modalInDom = true;

            const closeBtn = this.$el.querySelector( '.slbCloseBtn' );
            if ( closeBtn ) { closeBtn.focus( { preventScroll: true } ); }
        }
        return this;
    }

    setContent( content ) {
        const $content = typeof content === 'string' ? parseHtml( content ) : content;

        this.loading( false );
        this.setupLightboxHtml();

        this.$content.classList.remove( 'slbDirectionNext', 'slbDirectionPrev' );

        if ( this.direction ) {
            this.$content.classList.add(
                this.direction === 'next' ? 'slbDirectionNext' : 'slbDirectionPrev'
            );
        }

        if ( this.options.beforeSetContent ) {
            this.options.beforeSetContent( $content, this );
        }

        this.$content.innerHTML = '';
        this.$content.appendChild( $content );
        return this;
    }

    setImageDimensions() {
        if ( this.$currentImage ) {
            this.$currentImage.style.maxHeight = `${ window.innerHeight }px`;
        }
    }

    // -------------------------------------------------------------------------
    // Zoom & Touch
    // -------------------------------------------------------------------------

    applyZoomTransform() {
        if ( ! this.$currentImage ) { return; }
        this.$currentImage.style.transform =
            `scale(${ this.zoomState.scale }) translate(${ this.zoomState.x }px, ${ this.zoomState.y }px)`;
    }

    scheduleZoomUpdate() {
        if ( this.rafPending ) { return; }
        this.rafPending = true;
        requestAnimationFrame( () => {
            this.applyZoomTransform();
            this.rafPending = false;
        } );
    }

    resetZoom( smooth = false ) {
        if ( ! this.$currentImage ) {
            this.zoomState.scale = 1;
            this.zoomState.x     = 0;
            this.zoomState.y     = 0;
            return;
        }

        const wasZoomed = ! isApproximatelyOne( this.zoomState.scale ) || this.zoomState.x !== 0 || this.zoomState.y !== 0;

        this.zoomState.scale = 1;
        this.zoomState.x     = 0;
        this.zoomState.y     = 0;

        if ( smooth && wasZoomed ) {
            this.$currentImage.style.transition = 'transform 0.2s ease';
            this.applyZoomTransform();
            this.$currentImage.addEventListener( 'transitionend', () => {
                if ( this.$currentImage ) { this.$currentImage.style.transition = ''; }
            }, { once: true } );
        } else {
            this.$currentImage.style.transition = '';
            this.applyZoomTransform();
        }
    }

    handleTouchStart( e ) {
        const touches = e.touches;

        if ( touches.length === 1 ) {
            this.touchState.startX      = touches[ 0 ].screenX;
            this.touchState.startY      = touches[ 0 ].screenY;
            this.touchState.lastCenterX = touches[ 0 ].screenX;
            this.touchState.lastCenterY = touches[ 0 ].screenY;
            this.touchState.isZooming   = false;
        } else if ( touches.length === 2 ) {
            this.touchState.initialDistance = getTouchDistance( touches );
            const center = getTouchCenter( touches );
            this.touchState.lastCenterX = center.x;
            this.touchState.lastCenterY = center.y;
            this.touchState.isZooming   = true;
        }

        this.zoomState.initialScale = this.zoomState.scale;
        this.zoomState.initialX     = this.zoomState.x;
        this.zoomState.initialY     = this.zoomState.y;
    }

    handleTouchMove( e ) {
        const touches = e.touches;

        if ( touches.length === 2 ) {

            const currentDistance = getTouchDistance( touches );
            const center          = getTouchCenter( touches );

            if ( this.touchState.initialDistance > 0 ) {
                const scaleChange = currentDistance / this.touchState.initialDistance;
                this.zoomState.scale = Math.max( MIN_ZOOM, Math.min( MAX_ZOOM, this.zoomState.initialScale * scaleChange ) );

                if ( isApproximatelyOne( this.zoomState.scale ) ) {
                    this.zoomState.x = 0;
                    this.zoomState.y = 0;
                } else {
                    const deltaX = center.x - this.touchState.lastCenterX;
                    const deltaY = center.y - this.touchState.lastCenterY;
                    this.zoomState.x = this.zoomState.initialX + deltaX / this.zoomState.scale;
                    this.zoomState.y = this.zoomState.initialY + deltaY / this.zoomState.scale;
                }

                this.scheduleZoomUpdate();
            }

            this.touchState.lastCenterX = center.x;
            this.touchState.lastCenterY = center.y;
            this.touchState.isZooming   = true;

        } else if ( touches.length === 1 && this.zoomState.scale > MIN_ZOOM ) {

            const deltaX = touches[ 0 ].screenX - this.touchState.lastCenterX;
            const deltaY = touches[ 0 ].screenY - this.touchState.lastCenterY;
            this.zoomState.x += deltaX / this.zoomState.scale;
            this.zoomState.y += deltaY / this.zoomState.scale;
            this.scheduleZoomUpdate();

            this.touchState.lastCenterX = touches[ 0 ].screenX;
            this.touchState.lastCenterY = touches[ 0 ].screenY;
            this.touchState.isZooming   = true;

        }
    }

    handleTouchEnd( e ) {
        if (
            e.changedTouches.length === 1 &&
            ! this.touchState.isZooming &&
            e.touches.length === 0 &&
            isApproximatelyOne( this.zoomState.scale ) &&
            this.items.length > 1
        ) {
            const swipeX = e.changedTouches[ 0 ].screenX - this.touchState.startX;
            const swipeY = e.changedTouches[ 0 ].screenY - this.touchState.startY;

            if ( Math.abs( swipeX ) > Math.abs( swipeY ) && Math.abs( swipeX ) > this.options.swipeThreshold ) {
                swipeX > 0 ? this.prev() : this.next();
                return;
            }
        }

        if ( e.touches.length === 0 ) {
            if ( isApproximatelyOne( this.zoomState.scale ) && this.zoomState.scale !== 1 ) {
                this.resetZoom( true );
            }
            this.touchState.isZooming      = false;
            this.touchState.initialDistance = 0;
        }
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    setupLightboxEvents() {
        if ( this.eventRegistry.lightbox.length ) { return this; }

        this.addEvent( this.$el, 'click', ( e ) => {
            const $target = e.target;

            if ( $target.closest( '.slbCloseBtn' ) || ( this.options.closeOnOverlayClick && $target.matches( '.slbWrap' ) ) ) {
                this.close();
            } else if ( $target.closest( '.slbArrow' ) ) {
                $target.closest( '.next' ) ? this.next() : this.prev();
            } else if ( this.options.nextOnImageClick && this.items.length > 1 && $target.matches( '.slbImage' ) ) {
                this.next();
            }

        } ).addEvent( document, 'keyup', ( e ) => {

            if ( this.options.closeOnEscapeKey && e.key === 'Escape' ) { this.close(); }

            if ( this.items.length > 1 ) {
                if ( e.key === 'ArrowRight' ) { this.next(); }
                if ( e.key === 'ArrowLeft' )  { this.prev(); }
            }

        } ).addEvent( this.$el, 'keydown', ( e ) => {

            if ( e.key !== 'Tab' ) { return; }

            const focusable = Array.from(
                this.$el.querySelectorAll( 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])' )
            ).filter( ( el ) => ! el.disabled );

            if ( ! focusable.length ) { return; }

            const first = focusable[ 0 ];
            const last  = focusable[ focusable.length - 1 ];

            if ( e.shiftKey ) {
                if ( document.activeElement === first ) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if ( document.activeElement === last ) {
                    e.preventDefault();
                    first.focus();
                }
            }

        } ).addEvent( window, 'resize', () => {
            this.setImageDimensions();
        } ).addEvent( this.$el, 'touchstart', ( e ) => this.handleTouchStart( e ), 'lightbox', { passive: true } )
          .addEvent( this.$el, 'touchmove',   ( e ) => this.handleTouchMove( e ),  'lightbox', { passive: true } )
          .addEvent( this.$el, 'touchend',    ( e ) => this.handleTouchEnd( e ),   'lightbox', { passive: true } );

        return this;
    }

    close() {
        if ( this.modalInDom ) {
            this.runHook( 'beforeClose' );
            this.removeEvents( 'lightbox' );

            if ( this.$el ) { this.$el.parentNode.removeChild( this.$el ); }

            document.documentElement.classList.remove( this.options.htmlClass );
            document.body.style.overflow     = '';
            document.body.style.paddingRight = '';

            document.querySelectorAll( '.fixed-top, .fixed-bottom, .sticky-top' ).forEach( ( el ) => {
                el.style.paddingRight = el.dataset.slbPaddingRight || '';
                delete el.dataset.slbPaddingRight;
            } );

            this.modalInDom = false;
            this.runHook( 'afterClose' );

            if ( this._opener ) {
                this._opener.focus( { preventScroll: true } );
                this._opener = null;
            }
        }

        this.resetZoom();
        this.direction       = undefined;
        this.currentPosition = this.options.startAt;
    }

    destroy() {
        this.close();
        this.runHook( 'beforeDestroy' );
        this.removeEvents( 'thumbnails' );
        this.runHook( 'afterDestroy' );
    }

    runHook( name ) {
        if ( this.options[ name ] ) { this.options[ name ]( this ); }
    }

    static open( options ) {
        const instance = new SimpleLightbox( options );
        return options.content
            ? instance.setContent( options.content ).show()
            : instance.showPosition( instance.options.startAt );
    }

}

export default SimpleLightbox;
