/* New Instance view */
Atmo.Views.NewInstanceScreen = Backbone.View.extend({
	tagName: 'div',
	className: 'screen',
	id: 'imageStore',
	events: {
		'click .clear_search': 'clear_search',
		'change #image_search': 'filter_image_list',
		'keyup #image_search': 'filter_image_list',
		'click .image_list > li': 'img_clicked',
		'click #launchInstance': 'launch_instance',
		'keyup #newinst_name' : 'validate_name',
		'change #newinst_size': 'change_type_selection',
		'dblclick .image_list > li' : 'quick_launch',
	},
	template: _.template(Atmo.Templates.new_instance_screen),
	initialize: function(options) {
		Atmo.images.bind('reset', this.render_image_list, this);
		Atmo.images.bind('fail', this.report_error_image_list, this);
        Atmo.instances.bind('add', this.render_resource_charts, this);
        Atmo.instances.bind('remove', this.render_resource_charts, this);
		Atmo.instance_types.bind('reset', this.render_instance_type_list, this);
		Atmo.instance_types.bind('change:selected', this.update_resource_charts, this);
        this.launch_lock = false;
		this.under_quota = true;
        this.init_query = options['query'] ? options['query'] : null;
        this.tagger = null;
	},
	render: function() {
		this.$el.html(this.template());

		this.mem_resource_chart = new Atmo.Views.ResourceCharts({
			el: this.$el.find('#memHolder'), 
			quota_type: 'mem',
		}).render();
		this.cpu_resource_chart = new Atmo.Views.ResourceCharts({
			el: this.$el.find('#cpuHolder'), 
			quota_type: 'cpu'
		}).render();

		// Make the dropdown functional
		this.$el.find('a[data-target="advanced_options"]').click(function() {
			$('#advanced_options').collapse('toggle');
		});
		this.$el.find('#advanced_options').on('show', function() {
			$('a[data-target="advanced_options"]').addClass('dropup');
		});
		this.$el.find('#advanced_options').on('hide', function() {
			$('a[data-target="advanced_options"]').removeClass('dropup');
		});

		this.render_image_list();
		this.render_instance_type_list();

        // Assign content to the popovers
        this.$el.find('#help_image').popover({
            placement: 'bottom',
            title: 'Select an Image <a class="close" data-dismiss="popover" href="#new_instance" data-parent="help_image">&times</a>',
            html: true,
            content: function() {
                var content = 'An <b>image</b> is a template for an instance. The operating system, configuration, and software that comes pre-installed on your instance will depend on which image you choose.<br /><br />';
                content += 'An <b>instance</b> is a specific virtual machine with dedicated RAM, CPUs, and disk space, which exists on a physical compute node. You can use an instance as you would use a physical computer for most tasks.<br /><Br />';
                content += 'To launch an instance, first <b>choose an image</b>, then configure it if you\'d like. ';
                content += '(<a href="https://pods.iplantcollaborative.org/wiki/x/Lqxm" target="_blank">More information</a>)';
                return content;
            }
        }).click(this.x_close);
        this.$el.find('#help_image_search').popover({
            placement: 'right',
            title: 'Search Images <a class="close" data-dismiss="popover" href="#new_instance" data-parent="help_image_search">&times</a>',
            html: true,
            content: function() {
                var content = 'You can search images by name, description, or <br />emi number.<br /><br />';
                content += 'You can also search by tag using the syntax <br /> <em>tag:tag_to_find</em>.';
                return content;
            }
        }).click(this.x_close);
        this.$el.find('#help_resource_usage_newinst').popover({
            placement: 'bottom',
            title: 'My Projected Resource Usage <a class="close" data-dismiss="popover" href="#new_instance" data-parent="help_resource_usage_newinst">&times</a>',
            html: true,
            content: function() {
                var content = 'Your <strong>projected resource usage</strong> is determined by how many CPUs and GB of memory you would use by launching an new instance, including any resources your other instances are already using. <br /><br />';
                content += 'If you don\'t have enough resources to launch your preferred instance size, you can terminate a running instance or request more resources.';
                return content;
            }
        }).click(this.x_close);
        this.$el.find('#help_request_more_resources2').popover({
            placement: 'bottom',
            html: true,
            title: 'Request More Resources <a class="close" data-dismiss="popover" href="#new_instance" data-parent="help_request_more_resources2">&times</a>',
            content: function() {
                var content = '<form name="request_more_resources2"><input type="hidden" name="username" value="'+Atmo.profile.get('id')+'">';
                content += 'Requested Resources: <textarea name="quota" placeholder="E.g. 4 CPUs and 8 GB memory, enough for a c1.medium, etc."></textarea><br />';
                content += 'Reason you need these resources: <textarea name="reason" placeholder="E.g. To run a program or analysis, store larger output, etc. "></textarea><Br /><input type="submit" value="Request Resources" class="btn" id="submit_resources_request2"></form>';
                return content;
            }
        }).click(_.bind(this.x_close, this));

		return this;
	},
    x_close: function() {
            if($('#submit_resources_request2').length > 0)
				$('#submit_resources_request2').click(_.bind(this.submit_resources_request2, this));

            // Must assign this function after the popover is actually rendered, so we find '.close' element
            $('.close').click(function(e) {
                e.preventDefault();
                var popover_parent = $(this).data('parent');
                if (popover_parent != undefined) {
                    $('#'+popover_parent).popover('hide');
                }            
            });
	},
    submit_resources_request2: function(e) {
            e.preventDefault();

            // Make sure they filled out both fields
            var valid = true;

            var form = $('form[name="request_more_resources2"]');
            form.find('span').remove();

            if (form.find('textarea[name="quota"]').val().length == 0) {
                valid = false;
                form.find('textarea[name="quota"]').before('<span style="color: #B94A48">(Required)</span>');
            }
            if (form.find('textarea[name="reason"]').val().length == 0) {
                valid = false;
                form.find('textarea[name="reason"]').before('<span style="color: #B94A48">(Required)</span>');
            }
                
            if (valid) {

                var self = this;
                $.ajax({
                    type: 'POST',
                    url: site_root + '/api/request_quota/', 
                    data: form.serialize(),
                    success: function() {
                        $('#submit_resources_request2').val("Request Submitted!").attr("disabled", "disabled").click(function() { return false; });
						setTimeout(function() {
							$('#help_request_more_resources2').click();
						}, 1000);
                    },
					error: function() {
						Atmo.Utils.notify("Could not send request", 'Please email your quota request to <a href="mailto:support@iplantcollaborative.org">support@iplantcollaborative.org</a>', { no_timeout: true });
					},
                    dataType: 'text'
                });
            }
            return false;
    },
    render_resource_charts: function() {
        this.mem_resource_chart.render();
        this.cpu_resource_chart.render();
        this.$el.find('#newinst_size').trigger('change');
    },
	render_image_list: function() {
		var self = this;
		if(Atmo.images.models.length == 0) {
			// Called when images haven't yet loaded
			self.$el.find('#featured_image_list').append('<div style="text-align: center"><img src="'+site_root+'/resources/images/loader_large.gif" /></div>');
			self.$el.find('#misc_image_list').append('<div style="text-align: center"><img src="'+site_root+'/resources/images/loader_large.gif" /></div>');
		} 
		else {

			// Called when 'reset' is triggered because images have been fetched
			self.$el.find('#featured_image_list').html('');
			self.$el.find('#misc_image_list').html('');

			$.each(Atmo.images.models, function(i, image) {
				if (image.get('featured'))
					self.$el.find('#featured_image_list').append(new Atmo.Views.ImageListItem({model: image}).render().el);
				else
					self.$el.find('#misc_image_list').append(new Atmo.Views.ImageListItem({model: image}).render().el);
			});

			if (this.init_query)
				this.set_query(this.init_query);

			// Make all the tags clickable so they search for that tag when clicked

			var tag_els = this.$el.find('#image_holder .tag_list').children();
			$.each(tag_els, function(i, tag) {
				$(tag).click(function() {
					var tag_name = "tag:"+$(tag).text();
					var search_obj = self.$el.find('#image_search');
					var search_txt = $.trim(search_obj.val());
					if(search_txt.search(tag_name) == -1) {
						add_tag = search_txt.length == 0 ? tag_name : " "+tag_name;
						search_obj.val(search_txt+add_tag);
					}
					self.filter_image_list();
				});
			});
		}

		resizeApp();
	},
	report_error_image_list: function() {

		this.$el.find('#featured_image_list').html('');
		this.$el.find('#misc_image_list').html('<p class="alert alert-error"><strong>Error</strong> Could not load images.</p><p>Refresh the application to try again. Contact support if the problem persists.</p>');
	},
    set_query: function(query) {
        this.$el.find('#image_search').val(query);
		this.filter_image_list();
    },
	render_instance_type_list: function() {
		if (Atmo.instance_types.models.length > 0) {
			// this.$el.find('#newinst_size').val(Atmo.instance_types.models[0].get('id'));
			var set_default = false;
			this.under_quota = false;
			var self = this;
			$.each(Atmo.instance_types.models, function(idx, instance_type) {
				var opt = $('<option>', {
					value: instance_type.get('id'),
					html: function() {
						// Determine how many digits we want to display
						var digits = (instance_type.get('mem') % 1024 == 0) ? 0 : 1;

						// Make a human readable number
						var mem = (instance_type.get('mem') > 1024) ? '' + (instance_type.get('mem') / 1024).toFixed(digits) + ' GB' : (instance_type.get('mem') + ' MB') ;
						return instance_type.get('name') + ' (' + instance_type.get('cpus') + ' CPUs, ' + mem + ' memory, ' + instance_type.get('disk') + ' GB disk)';
					},
					'data' : {'instance_type' : instance_type}
				});

				if (instance_type.get('remaining') > 0) {
					opt.data('available', true);
					if (!set_default) {
						var enough_cpus = self.cpu_resource_chart.add_usage(instance_type.attributes.cpus, "cpuHolder");
						var enough_mem = self.mem_resource_chart.add_usage(instance_type.attributes.mem, "memHolder");
						if (enough_cpus && enough_mem) {
							self.under_quota = true;
						}
						else {
							self.$el.find('#launchInstance').attr('disabled', 'disabled');
							self.under_quota = false;
						}
						set_default = true;
					}
				}
				else {
					opt.data('available', false);
					opt.attr('disabled', 'disabled');
					opt.html(opt.html() + ' (At Capacity)');
				}
				self.$el.find('#newinst_size').append(opt);
			});
			window.instance_types = Atmo.instance_types.models;	

            // Sets initial selected_instance_type to m1.small
            default_instance = Atmo.profile.attributes['settings'].default_size;
            this.$el.find('#newinst_size').val(default_instance);
            this.$el.find('#newinst_size').trigger('change');
		}
		else {
			// Error getting instance types for this provider, inform user.
			this.$el.find('#newinst_size').append($('<option>', {
				html: 'Instance Sizes Unavailable', 
				disabled: 'disabled'
			}));
			this.launch_lock = true;
			var select_obj = this.$el.find('#newinst_size');
			select_obj.parent().find('.help-block').remove();

			select_obj.parent().append($('<div/>', {
				'class': 'help-block',
				html: 'If this problem persists, please contact Support.'
			}));
			select_obj.closest('.control-group').addClass('error');
		}
	},
	change_type_selection: function(e) {
		$(e.currentTarget).find(':selected').data('instance_type').select();
	},
	update_resource_charts: function() {
		var selected_instance_type = Atmo.instance_types.selected_instance_type;

		//if (Atmo.instances.models.length == 0)
		var under_cpu = this.cpu_resource_chart.add_usage(
			selected_instance_type.attributes.cpus, 
			{ 
				is_initial: (Atmo.instances.models.length == 0) ? true : false
			}
		); 
		var under_mem = this.mem_resource_chart.add_usage(
			selected_instance_type.attributes.mem,
			{ 
				is_initial: (Atmo.instances.models.length == 0) ? true : false
			}
		);

		if ((under_cpu == false) || (under_mem == false)) {
			this.$el.find('#launchInstance').attr('disabled', 'disabled');
			this.under_quota = false;
		}
		else {
			if ($('.image_list > li').hasClass('active') && !this.launch_lock) {
				this.$el.find('#launchInstance').removeAttr('disabled');
			}
			this.under_quota = true;
		}

		var select_obj = this.$el.find('#newinst_size');
		select_obj.parent().find('.help-block').remove();

		if (!this.under_quota) {
			select_obj.parent().append($('<div/>', {
				'class': 'help-block',
				html: 'Launching this instance would exceed your quota. Select a smaller size or terminate another instance.'
			}));
			select_obj.closest('.control-group').addClass('error');
		}
		else {
			
			if (select_obj.parent().find('.help-block').length > 1) {
				select_obj.parent().find('.help-block').remove();
			}
			select_obj.closest('.control-group').removeClass('error');

		}

	},
	clear_search: function() {
		this.$el.find('#image_search').val('').trigger('keyup');
	},
	filter_by_tag: function(tag) {
		
		this.$el.find(".image_list > li").hide();
		//this.$el.find(".image_list li:icontains("+text+")").show();

		$.each(this.$el.find('.image_list > li'), function(i, e) {
			var found = false;
			var testImage = $(e).data('image');

			var tags = testImage.get('tags');
			$.each(tags, function(idx, el_tag) {
				found = found || (el_tag == tag);
				if(found){
					//console.log("Matched on Tag");
					return;
				}
			});
				
			if (found) $(e).show();
		});
	},
	filter_image_list: function(e) {
		/** Quick text validation*/
		var text = this.$el.find('#image_search').val();
		if (text.match(/[^\:\._\-\/\+\[\]\,a-zA-Z0-9 ]/g)) {
			this.$el.find('#image_search').val(text.replace(/[^\:\._\-\/\+\[\]\,a-zA-Z0-9 ]/g, ''));
		}
		text = this.$el.find('#image_search').val();
		if (text.length !== 0) {
			
			/**Filter out those who don't contain text*/
			this.$el.find(".image_list > li").hide();
			arr = text.split(/\s+/g);
			tags = [];
			words = [];
			$.each(arr, function(i, word) {
				try {
					patt = /tag:(\w+)/gi; //Hacky? Must be re-init every time to avoid false negatives
					match = patt.exec(word);
					tags.push(match[1]);
				} catch(err) {
					words.push(word);
				}
			});
			//console.log(tags);
			//console.log(words);
			//this.$el.find(".image_list li:icontains("+text+")").show();

			$.each(this.$el.find('.image_list > li'), function(i, e) {
				var found = true;

				var testImage = $(e).data('image');
				var test_tags = testImage.get('tags');

                // To make the search case-insensitive
                for (var i = 0; i < test_tags.length; i++) {
                    test_tags[i] = test_tags[i].toLowerCase();
                } 

				var test_id   = testImage.id;
				var test_name = testImage.get('name');
				var test_desc = testImage.get('description');

                //console.log('test_tags', test_tags);

				$.each(tags, function(idx,tag) {
                    // Can't just test against the whole array, or will only get complete matches
					//var tag_idx = test_tags.indexOf(tag.toLowerCase());

                    var found_one = false;

                    // Need to test for partial matches -- already a ton of nested loops, why not one more!!!
                    for (var i = 0; i < test_tags.length; i++) {
                        if (test_tags[i].indexOf(tag.toLowerCase()) == -1) {

                            // If already found one tag, keep found_one true.
                           found_one = (found_one == true) ? true : false; 
                        }
                        else {
                            found_one = true;
                        }
                    }
                    if (!found_one) {
                        found = false;
                        return;
                    } 
					//console.log("Found tag:"+tag);
				});
				$.each(words, function(idx,word) {
                    word = word.toLowerCase();
					if (! test_name.toLowerCase().find(word) && ! test_desc.toLowerCase().find(word) && ! test_id.toLowerCase().find(word)) {
						found = false;
						return;
					}
					//console.log("Found word:"+word);
				});
				if (found) $(e).show();
			});
		} else {
			this.$el.find(".image_list > li").show();
		}
	},
	img_clicked: function(e) {
		var img = $(e.currentTarget).data('image');
		//Backbone.history.navigate('#images/' + img.get('id'));
		$('.image_list > li').removeClass('active');
		$(e.currentTarget).addClass('active');

		if (this.under_quota && !this.launch_lock) 
			this.$el.find('#launchInstance').removeAttr('disabled');
		else
			this.$el.find('#launchInstance').attr('disabled', 'disabled');


		this.$el.find('#selected_image_icon_container').html('<img src="'+img.get('image_url')+'" width="75" height="75" />');
		this.$el.find('#selected_image_description')
			.html(img.get('description'));
		this.$el.find('#newinst_name_title').html('of ' + img.get('name_or_id'));
		this.$el.find('#newinst_name').val(img.get('name_or_id'));

		// Validate name
		this.$el.find('#newinst_name').trigger('keyup');

		// Make the tags fancy
		var tags_array = img.get('tags');

        this.tagger = new Atmo.Views.Tagger({
            default_tags: tags_array,
            sticky_tags: tags_array
        });

        this.$el.find('#newinst_tags')
            .empty()
            .append(this.tagger.render().el);

		this.$el.find('#newinst_owner')
            .attr('disabled', 'disabled')
		    .val(img.get('ownerid'));

		this.$el.find('#newinst_createdate')
            .attr('disabled','disabled')
            .val(img.get('create_date').toString("MMM d, yyyy"));

		this.$el.find('#newinst_image_id').val(img.get('id'))
	},
	quick_launch: function(e) {
		// Emulate selection
        launch_setting = Atmo.profile.attributes['settings'].quick_launch;
        if (launch_setting == false) {
            Atmo.Utils.notify("Quicklaunch Disabled", "Quicklaunch has been disabled. Edit your settings to re-enable.");
            return;
        }
		this.img_clicked(e);

		this.$el.find('#launchInstance').trigger('click');

	},
	launch_instance: function(e) {
		e.preventDefault();

		var form = this.$el.find('#image_customlaunch form')[0];
        var image = Atmo.images.get($(form.image_id).val());

		var params = {
		  'machine_alias': image.get('id'),
          'size_alias': $(form.newinst_size).val(),
		  'name': $(form.name).val(),
		  'tags': this.tagger.get_tags()
		};
		
		var error_elements = [];
		var errors = [];

		this.$el.find('.error').removeClass('error');
		this.$el.find('.help-inline').remove();

		var nameText = params['name'];
		if(nameText.length === 0) {
			error_elements.push(form.name);
			errors.push('Enter a name for your instance');
		}

		if (errors.length == 0) {
            var header = '<img src="../resources/images/loader_bluebg.gif" /> Launching Instance...';
            var body = '';
            Atmo.Utils.notify(header, body, { no_timeout : true});

            // Prevent launching one instance while another is just launched
            this.launch_lock = true;
			var instance = new Atmo.Models.Instance();
			var self = this;
			$('#launchInstance')
				.attr('disabled', 'disabled')
				.val('Launching Instance...')
				.after($('<div/>', {'class': 'loader'}));
			instance.save(params, {
				wait: true,
				success: function(model) {
					Atmo.instances.update({success: function() {
                        self.launch_lock = false;
						Atmo.instances.get(model.id).select();
					}});
					window.app.navigate('instances', {trigger: true, replace: true});
					self.render();
                    Atmo.Utils.notify("Instance Launched", "Your instance will be ready soon.");
				},
				error: function() {
					Atmo.Utils.notify("Instance launch was unsuccessful", 'If the problem persists, please email <a href="mailto:support@iplantcollaborative.org">support@iplantcollaborative.org</a>', { no_timeout: true });
				},
			});
		} else {
			$.each(error_elements, function(i, e) {
				$(e).closest('.control-group').addClass('error');
				$(e).after($('<p>', {'class': 'help-inline', html: errors[i]}));
			});
		}

		return false;
	},
	validate_name: function() {
		var instance_name = this.$el.find('#newinst_name').val();
		var instance_name_input = this.$el.find('#newinst_name');

		// Get rid of any pre-existing error message on next key up
		if (instance_name_input.parent().children().length > 1) {
			instance_name_input.parent().children().eq(1).remove();
			instance_name_input.closest('.control-group').removeClass('error');
		}

		if (instance_name.length < 1 || instance_name.trim().length < 1) {
			instance_name_input.parent().append($('<div/>', {
				'class': 'help-block',
				html: 'Instance name cannot be blank'
			}));
			instance_name_input.closest('.control-group').addClass('error');
		}
		else {
			if (instance_name_input.parent().children().length > 1) {
				instance_name_input.parent().children().eq(1).remove();
			}
			instance_name_input.closest('.control-group').removeClass('error');
		}
	}
});