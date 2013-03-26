Atmo.Views.FeedbackLink = Backbone.View.extend({
	initialize: function() {
		var self = this;
		this.$el.popover({
			placement : 'top',
			title: 'Feedback Form <a class="close" data-dismiss="popover" href="#">&times</a>',
            html: true,
			trigger: 'click',
            content: _.template(Atmo.Templates.feedback_form),
		}).click(function() {
			$('a[data-dismiss="popover"]').click(_.bind(self.cancel_popover, self));
			$('#cancel_popover').click(_.bind(self.cancel_popover, self));
			$('#submit_feedback').click(_.bind(self.submit_feedback, self));
		});
	},
	cancel_popover: function(e) {
		e.preventDefault();
		this.$el.popover('hide');
	},
	submit_feedback: function(e) {
		e.preventDefault();

		var post_data = {
		  message: $('#feedback').val(),
		  'location': window.location.href,
                  'resolution': { 'viewport': {'width': $(window).height(),
                                                'height': $(window).width()},
                                   'screen': {'width':  screen.width,
                                              'height': screen.height}}
	        };

          console.log(post_data);

		var self = this;

		if (post_data["message"].length > 0) {

			$('#submit_feedback').html('<img src="'+site_root+'/resources/images/loader.gif" /> Sending...').attr('disabled', 'disabled');				

			$.ajax(site_root + '/feedback/', {
				type: 'POST',
				data: post_data,
				success: function(data) {
					console.log(post_data);

					setTimeout(function() {

					$('#feedback_link').popover('hide');

					Atmo.Utils.notify("Thanks for your feedback!", "Support has been notified.");

						self.$el.popover({
							placement : 'top',
							title: 'Thanks for your feedback! <a class="close" data-dismiss="popover" href="#">&times</a>',
                            html: true,
							trigger: 'click',
							content: function() {
								var form = $('<form/>');
								form.append($('<span/>', {
									'class': 'help-block',
									html: 'Feel free to submit additional comments.'
								}));
								var textarea = $('<textarea/>', {
									rows: '5',
									id: 'feedback'
								});
								form.append(textarea);
								form.append($('<button/>', {
									'class': 'btn btn-primary',
									html: 'Send',
									id: 'submit_feedback',
									type: 'submit',
								}));
								form.append($('<a>', {
									'class': 'btn',
									href: '#',
									html: 'Cancel',
									id: 'cancel_popover',
								}));
								return form;
							}
						}).click(function() {
							$('a[data-dismiss="popover"]').click(_.bind(self.cancel_popover, self));
							$('#cancel_popover').click(_.bind(self.cancel_popover, self));
							$('#submit_feedback').click(_.bind(self.submit_feedback, self));
						});
												
						//self.$el.popover('show');

						setTimeout(function() {
							$('#feedback_link').popover('hide');
						}, 5*1000);
					}, 2*1000);
				}, 
				error: function(response_text) {
					Atmo.Utils.notify("An error occured", 'Your feedback could not be submitted. If you\'d like to send it directly to support, email <a href="mailto:support@iplantcollaborative.org">support@iplantcollaborative.org</a>.');
				}
			});
		}
	}
});